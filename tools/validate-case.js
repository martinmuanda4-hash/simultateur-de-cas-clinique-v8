#!/usr/bin/env node
"use strict";

/*
 * Validates clinical case files.
 *
 *   node tools/validate-case.js                      -> every case listed in data/cas-index.json
 *   node tools/validate-case.js path/to/case.json    -> one specific file
 *
 * Exit code 1 if at least one error is found. Warnings never fail the check.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STEP_KEYS = [
  "etape1_anamnese",
  "etape2_examen_physique",
  "etape3_paraclinique",
  "etape4_diagnostic",
  "etape5_traitement",
  "etape6_debriefing"
];

function normalize(text) {
  return String(text).toLowerCase().replace(/œ/g, "oe").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validateCase(file, ui) {
  const errors = [];
  const warnings = [];
  const err = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);

  let data;
  try {
    data = readJson(file);
  } catch (error) {
    return { errors: ["JSON invalide : " + error.message], warnings };
  }

  const isText = (value) => typeof value === "string" && value.trim().length > 0;
  const isList = (value) => Array.isArray(value) && value.length > 0;
  const need = (condition, message) => { if (!condition) err(message); };

  function checkKeywords(label, keywords) {
    if (!isList(keywords)) { err(label + " : liste de mots-clés vide ou absente"); return; }
    keywords.forEach((keyword) => {
      if (!isText(keyword)) { err(label + " : mot-clé vide"); return; }
      if (normalize(keyword).length === 0) err(label + " : mot-clé sans lettre (« " + keyword + " »)");
      if (normalize(keyword).length <= 1) warn(label + " : mot-clé d'une seule lettre « " + keyword + " » (trop ambigu)");
    });
  }

  // Top level
  need(isText(data.id), "id manquant");
  need(isText(data.titre), "titre manquant");
  need(isText(data.specialite), "specialite manquante");
  need(typeof data.scoreInitial === "number" && data.scoreInitial > 0 && data.scoreInitial <= 100,
    "scoreInitial doit être un nombre entre 1 et 100");
  need(data.etapes && typeof data.etapes === "object", "bloc etapes manquant");
  if (!data.etapes) return { errors, warnings };
  STEP_KEYS.forEach((key) => need(data.etapes[key], "étape manquante : " + key));

  // Metadata, rules, introduction
  if (!data.metadonnees) warn("metadonnees absentes (difficulté, durée)");
  if (!data.regles) warn("regles absentes (valeurs par défaut utilisées : aide -2, 3 essais)");
  const intro = data.introduction || {};
  ["titre", "description", "lieu", "contexte", "motifConsultation"].forEach((key) =>
    need(isText(intro[key]), "introduction." + key + " manquant"));
  ["lieu", "contexte", "motifConsultation", "constantes"].forEach((key) =>
    need(intro.libelles && isText(intro.libelles[key]), "introduction.libelles." + key + " manquant"));

  // Step 1 : history taking
  const s1 = data.etapes.etape1_anamnese;
  if (s1) {
    need(isText(s1.presentationInitiale), "etape1 : presentationInitiale manquante");
    need(isText(s1.aide), "etape1 : aide manquante");
    const config = ui && ui.anamnese;
    if (!config) {
      err("interface.json : bloc « anamnese » manquant");
    } else {
      const rubrics = config.rubriques || [];
      const standard = config.questionsStandard || {};
      const elements = s1.elements;
      if (!isList(elements)) {
        err("etape1 : elements vide ou absent");
      } else {
        const ids = new Set();
        elements.forEach((element, index) => {
          const label = "etape1 element « " + (element.id || index + 1) + " »";
          if (!isText(element.id)) { err("etape1 element " + (index + 1) + " : id manquant"); return; }
          if (ids.has(element.id)) err(label + " : id en double");
          ids.add(element.id);
          const base = standard[element.id];
          if (!base) {
            const rubric = rubrics.find((r) => r.id === element.rubrique);
            need(rubric, label + " : rubrique inconnue ou absente (« " + element.rubrique + " »)");
            if (rubric && element.sousRubrique && !(rubric.sousRubriques || []).some((sub) => sub.id === element.sousRubrique)) {
              err(label + " : sous-rubrique « " + element.sousRubrique + " » inconnue dans « " + element.rubrique + " »");
            }
            need(isText(element.libelle), label + " : libelle manquant");
            need(isText(element.questionExemple), label + " : questionExemple manquante");
            checkKeywords(label, element.motsCles);
          } else if (element.motsCles) {
            checkKeywords(label, element.motsCles);
          }
          const hasDefault = Boolean(base && isText(base.defaut));
          need(isText(element.reponse) || hasDefault, label + " : reponse manquante (aucune réponse par défaut pour cette question standard)");
          if (!isText(element.note) && !(base && isText(base.noteDefaut))) {
            warn(label + " : note manquante (le carnet affichera la réponse entière)");
          }
          if (element.pertinence !== undefined && !["cle", "utile", "systematique"].includes(element.pertinence)) {
            err(label + " : pertinence invalide (cle, utile ou systematique)");
          }
          if (element.pertinence === "cle" && !isText(element.pourquoi) && !(base && isText(base.pourquoi))) {
            warn(label + " : question clé sans « pourquoi » (explication du débriefing)");
          }
          [].concat(element.motsCles || [], element.exclusions || []).forEach((keyword) => {
            const bare = String(keyword).replace(/^=/, "");
            if (normalize(bare) !== bare) warn(label + " : mot-clé « " + keyword + " » non normalisé (minuscules, sans accent ni apostrophe)");
          });
        });
        elements.forEach((element) => (element.inclut || []).forEach((id) => {
          if (!ids.has(id) && !standard[id]) err("etape1 element « " + element.id + " » : inclut « " + id + " » inexistant");
        }));
        (s1.recitSpontane || []).forEach((id) => {
          if (!ids.has(id) && !(standard[id] && standard[id].defaut)) err("etape1 : recitSpontane « " + id + " » inexistant");
        });
        if (!isList(s1.recitSpontane)) warn("etape1 : recitSpontane vide (une question ouverte n'obtiendra aucune réponse)");

        const cles = elements.filter((e) => e.pertinence === "cle").length;
        if (cles < 3) warn("etape1 : seulement " + cles + " question(s) clé(s) (3 à 10 recommandées)");
        const toValidate = elements.filter((e) => e.aValider).length;
        if (toValidate > 0) warn("etape1 : " + toValidate + " réponse(s) marquée(s) aValider (voir node tools/export-a-valider.js)");
        const missing = Object.keys(standard).filter((id) => !standard[id].defaut && !ids.has(id));
        if (missing.length > 0) {
          warn("etape1 : questions standard sans réponse dans ce cas (absentes de l'interrogatoire) : " + missing.join(", "));
        }
      }
    }
  }

  // Step 2
  const s2 = data.etapes.etape2_examen_physique;
  if (s2) {
    need(s2.constantes && Object.keys(s2.constantes).length > 0, "etape2 : constantes manquantes");
    Object.keys(s2.constantes || {}).forEach((key) => {
      if (ui && ui.libellesConstantes && !ui.libellesConstantes[key]) {
        warn("etape2 : constante « " + key + " » sans libellé dans interface.json (libellesConstantes)");
      }
      if (!/\d/.test(String(s2.constantes[key]))) err("etape2 : constante « " + key + " » sans valeur numérique");
    });
    need(typeof s2.malusSiOubli === "number" && s2.malusSiOubli >= 0, "etape2 : malusSiOubli invalide");
    const catalogue = {};
    (((ui || {}).examenPhysique || {}).regions || []).forEach((region) => {
      (region.manoeuvres || []).forEach((m) => { catalogue[m.id] = region.id; });
    });
    const regionIds = (((ui || {}).examenPhysique || {}).regions || []).map((region) => region.id);
    need(isList(s2.manoeuvres), "etape2 : manoeuvres manquantes");
    let keyCount = 0;
    const seenIds = new Set();
    (s2.manoeuvres || []).forEach((m) => {
      const label = "etape2 manoeuvre « " + m.id + " »";
      if (seenIds.has(m.id)) err(label + " : id en double");
      seenIds.add(m.id);
      const inCatalogue = Object.prototype.hasOwnProperty.call(catalogue, m.id);
      if (!inCatalogue) {
        need(regionIds.includes(m.region), label + " : manœuvre propre au cas, région inconnue (" + m.region + ")");
        need(isText(m.libelle) && isText(m.resultat), label + " : libelle et resultat requis pour une manœuvre propre au cas");
      }
      if (m.pertinence && !["cle", "utile", "systematique"].includes(m.pertinence)) err(label + " : pertinence invalide");
      if (m.pertinence === "cle") keyCount += 1;
      if ((m.pertinence === "cle" || m.pertinence === "utile") && !isText(m.pourquoi)) {
        warn(label + " : manœuvre " + m.pertinence + " sans texte « pourquoi »");
      }
      if (inCatalogue && !isText(m.resultat) && m.pertinence === "cle") {
        err(label + " : une manœuvre clé doit avoir son propre résultat (le résultat normal par défaut serait faux)");
      }
    });
    need(keyCount > 0, "etape2 : au moins une manœuvre clé (pertinence « cle ») est nécessaire");
    const examFlagged = (s2.manoeuvres || []).filter((m) => m.aValider).length;
    if (examFlagged > 0) warn("etape2 : " + examFlagged + " manœuvre(s) marquée(s) aValider");
    need(isText(s2.aide), "etape2 : aide manquante");
    // Heart rate coherence between vitals and the cardiac auscultation
    const hr = String((s2.constantes || {}).frequenceCardiaque || "").match(/\d+/);
    const cardiac = (s2.manoeuvres || []).find((m) => m.id === "ausc_cardiaque");
    const textHr = cardiac && String(cardiac.resultat || "").match(/(\d+)\s*bpm/i);
    if (hr && textHr && hr[0] !== textHr[1]) {
      warn("etape2 : FC " + hr[0] + " bpm dans les constantes mais " + textHr[1] + " bpm à l'auscultation cardiaque");
    }
  }

  // Step 3
  const s3 = data.etapes.etape3_paraclinique;
  if (s3) {
    need(isText(s3.question), "etape3 : question manquante");
    const priority = Object.entries(s3.examensValides || {});
    need(priority.length > 0, "etape3 : aucun examen prioritaire (examensValides)");
    const priorityKeywords = [];
    priority.forEach(([key, exam]) => {
      checkKeywords("etape3 examen « " + key + " »", exam.motsCles);
      need(isText(exam.resultat), "etape3 : résultat manquant pour « " + key + " »");
      if (!isText(exam.libelle)) warn("etape3 : libelle manquant pour « " + key + " » (titre du résultat)");
      (exam.motsCles || []).forEach((k) => priorityKeywords.push({ key, norm: normalize(k) }));
    });
    const groups = new Set(priority.map(([, exam]) => exam.groupeAlternatif).filter(Boolean));
    priority.forEach(([key, exam]) => {
      if (!exam.prerequis) return;
      const label = "etape3 « " + key + " » prerequis";
      need(groups.has(exam.prerequis.groupe), label + " : groupe « " + exam.prerequis.groupe + " » inexistant (aucun examen n'a ce groupeAlternatif)");
      need(isText(exam.prerequis.message), label + " : message manquant");
      need(isText(exam.prerequis.libelleJournal), label + " : libelleJournal manquant");
      need(typeof exam.prerequis.malus === "number" && exam.prerequis.malus >= 0, label + " : malus invalide");
    });
    groups.forEach((group) => {
      const members = priority.filter(([, exam]) => exam.groupeAlternatif === group);
      if (members.length < 2) warn("etape3 : le groupe « " + group + " » n'a qu'un examen (pas d'alternative)");
    });
    (s3.examensAcceptables || []).forEach((exam, index) => {
      const label = "etape3 acceptable " + (index + 1);
      need(isText(exam.nom), label + " : nom manquant");
      checkKeywords(label, exam.motsCles);
      need(typeof exam.malus === "number" && exam.malus >= 0, label + " : malus invalide");
      (exam.motsCles || []).forEach((k) => {
        const n = normalize(k);
        const clash = priorityKeywords.find((p) => p.norm === n);
        if (clash) err(label + " : le mot-clé « " + k + " » est aussi un examen prioritaire (" + clash.key + ")");
      });
    });
    need(typeof s3.malusExamenInutile === "number" && s3.malusExamenInutile >= 0, "etape3 : malusExamenInutile invalide");
    need(isText(s3.aide), "etape3 : aide manquante");
  }

  // Step 4
  const s4 = data.etapes.etape4_diagnostic;
  if (s4) {
    need(isText(s4.question), "etape4 : question manquante");
    need(isList(s4.diagnosticsAttendus), "etape4 : diagnosticsAttendus vide");
    (s4.diagnosticsAttendus || []).forEach((diagnosis, index) => {
      const label = "etape4 diagnostic " + (index + 1);
      need(isText(diagnosis.nom), label + " : nom manquant");
      need(typeof diagnosis.points === "number" && diagnosis.points >= 0, label + " : points invalides");
      checkKeywords(label, diagnosis.motsCles);
    });
    need(isText(s4.aide), "etape4 : aide manquante");
  }

  // Step 5
  const s5 = data.etapes.etape5_traitement;
  if (s5) {
    need(isList(s5.groupesTraitement), "etape5 : groupesTraitement vide");
    (s5.groupesTraitement || []).forEach((group, index) => {
      need(isText(group.libelle), "etape5 groupe " + (index + 1) + " : libelle manquant");
      checkKeywords("etape5 groupe " + (index + 1), group.motsCles);
    });
    const fatal = s5.erreursFatales || {};
    checkKeywords("etape5 erreursFatales", fatal.motsCles);
    need(typeof fatal.punition === "number" && fatal.punition > 0, "etape5 : punition invalide");
    need(isText(fatal.message), "etape5 : message d'erreur fatale manquant");
    // A fatal keyword must not also be a required treatment keyword
    const treatmentKeywords = (s5.groupesTraitement || []).flatMap((g) => (g.motsCles || []).map(normalize));
    (fatal.motsCles || []).forEach((k) => {
      if (treatmentKeywords.includes(normalize(k))) err("etape5 : « " + k + " » est à la fois traitement attendu et erreur fatale");
    });
  }

  // Step 6
  const s6 = data.etapes.etape6_debriefing;
  if (s6) need(isList(s6.pointsCles), "etape6 : pointsCles vide");

  // Score budget: can a student lose more than the initial score?
  if (s2 && s3 && s4 && s5) {
    const maxLoss =
      ((s2 && s2.malusSiOubli) || 0) +
      Object.values((s3 && s3.examensValides) || {}).reduce((sum, exam) => sum + ((exam.prerequis && exam.prerequis.malus) || 0), 0) +
      (s4.diagnosticsAttendus || []).reduce((sum, d) => sum + (d.points || 0), 0) +
      ((s5.erreursFatales || {}).punition || 0);
    if (maxLoss >= data.scoreInitial) {
      warn("score : les pénalités fixes (" + maxLoss + ") atteignent le score initial (" + data.scoreInitial + ")");
    }
  }

  // Placeholders left over from the template
  const raw = fs.readFileSync(file, "utf8");
  const placeholders = (raw.match(/À remplir/g) || []).length;
  if (placeholders > 0) warn(placeholders + " champ(s) « À remplir » restent à compléter");

  return { errors, warnings };
}

function main() {
  const ui = readJson(path.join(ROOT, "data", "interface.json"));
  const args = process.argv.slice(2);
  let files;
  if (args.length > 0) {
    files = args.map((arg) => path.resolve(process.cwd(), arg));
  } else {
    const index = readJson(path.join(ROOT, "data", "cas-index.json"));
    files = index.cas.map((entry) => path.join(ROOT, entry.fichier));
  }

  let failed = false;
  files.forEach((file) => {
    const { errors, warnings } = validateCase(file, ui);
    console.log("\n" + path.relative(ROOT, file));
    if (errors.length === 0 && warnings.length === 0) console.log("  OK : aucun problème");
    errors.forEach((message) => console.log("  ERREUR  " + message));
    warnings.forEach((message) => console.log("  attention  " + message));
    if (errors.length > 0) failed = true;
  });
  process.exit(failed ? 1 : 0);
}

main();
