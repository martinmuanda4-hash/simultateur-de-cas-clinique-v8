#!/usr/bin/env node
"use strict";

/*
 * Automated checks of the engine (keyword matching, typo tolerance, fatal
 * errors, monitor logic) against the case listed first in data/cas-index.json.
 *
 *   node tools/test-engine.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const src = read("app.js");
const index = JSON.parse(read("data/cas-index.json"));
const ui = JSON.parse(read("data/interface.json"));
const data = JSON.parse(read(index.cas[0].fichier));

// --- Matching helpers (everything before the Score section of app.js) -----
const helpersSource = src.split("/* Score")[0];
const api = new Function(helpersSource + "; return {normalize, hasKeyword, containsFatalKeyword, findKeyword, formatText, editDistance, buildAnamnesisItems, matchAnamnesisItems, detectCommunication, buildAnamnesisHint, buildExamItems, hasDoneKeyManeuver, examToolOf, examItemsFor};")();

const results = [];
const check = (name, condition) => results.push([name, !!condition]);
const e = data.etapes;

// --- Normalisation and typo tolerance ------------------------------------
check("accents and case ignored", api.normalize("Céphalées Œdème") === "cephalees oedeme");
check("edit distance", api.editDistance("ceftriaxone", "ceftriaxon") === 1);
check("typo tolerated (ceftriaxon)", api.hasKeyword("ceftriaxon 2g", e.etape5_traitement.groupesTraitement[1].motsCles));
check("typo tolerated (convulsion)", api.hasKeyword("des convulsion ?", ["convuls"]));
check("whole-word marker (=ains) ignores 'certains'", !api.hasKeyword("certains médicaments", ["=ains"]) && api.hasKeyword("des AINS", ["=ains"]));
check("short word needs whole word", !api.hasKeyword("plasmodium", e.etape3_paraclinique.examensValides.ponction_lombaire.motsCles));
check("template formatting", api.formatText("-{points} points", { points: 10 }) === "-10 points");

// --- History taking (anamnesis) -------------------------------------------
const anamnesisConfig = ui.anamnese;
const items = api.buildAnamnesisItems(e.etape1_anamnese, anamnesisConfig);
const byId = {};
items.forEach((item) => { byId[item.id] = item; });
const matched = (question) => api.matchAnamnesisItems(items, question).map((item) => item.id);
const asks = (question, id) => matched(question).includes(id);
const only = (question, id) => { const m = matched(question); return m.length === 1 && m[0] === id; };

check("items are built (standard + case)", items.length >= 25);
check("ids are unique", new Set(items.map((i) => i.id)).size === items.length);
check("every item has an answer, a label, keywords", items.every((i) => i.reponse && i.libelle && i.keywords.length > 0));
check("items are sorted by rubric order",
  items.every((item, k) => k === 0 || anamnesisConfig.rubriques.findIndex((r) => r.id === items[k - 1].rubrique) <= anamnesisConfig.rubriques.findIndex((r) => r.id === item.rubrique)));
check("standard defaults are 'systematique', case answers keep their level",
  byId.atcd_chirurgicaux.pertinence === "systematique" && byId.allergies.pertinence === "cle" && byId.midazolam.pertinence === "cle");
check("a standard question without answer is absent (e.g. no default for pregnancy elsewhere)",
  api.buildAnamnesisItems({ elements: [] }, anamnesisConfig).every((i) => i.id !== "grossesse"));
check("case answer overrides the default", byId.allergies.reponse !== anamnesisConfig.questionsStandard.allergies.defaut);
check("key items exist in each essential rubric",
  ["symptome_dominant", "antecedents", "histoire_maladie", "complements"].every((r) => items.some((i) => i.rubrique === r && i.pertinence === "cle")));

// natural questions -> the right information (and only it)
check("'qu'est-ce qui vous amène' -> motif", only("Qu'est-ce qui vous amène ?", "motif"));
check("'depuis quand a-t-elle mal à la tête' -> apparition", only("Depuis quand a-t-elle mal à la tête ?", "apparition"));
check("'comment ça a évolué' -> duree", only("Comment ça a évolué ?", "duree"));
check("'où a-t-elle mal' -> localisation", only("Où a-t-elle mal exactement ?", "localisation"));
check("'comment est la douleur' -> caractere", only("Comment est la douleur ?", "caractere"));
check("'qu'est-ce qui aggrave ou soulage' -> facteurs only", only("Qu'est-ce qui aggrave ou soulage la douleur ?", "facteurs"));
check("'est-ce que ça irradie' -> irradiation", only("Est-ce que ça irradie ?", "irradiation"));
check("'à quel moment de la journée' -> chronologie", only("À quel moment de la journée ça fait le plus mal ?", "chronologie"));
check("'sur une échelle de 1 à 10' -> gravite", only("Sur une échelle de 1 à 10, quelle est l'intensité ?", "gravite"));
check("'a-t-elle de la fièvre' -> fievre", only("A-t-elle de la fièvre ?", "fievre"));
check("'quelle est sa température' -> fievre (not temple)", only("Quelle est sa température ?", "fievre"));
check("'a-t-elle vomi' -> vomissements", only("A-t-elle vomi ?", "vomissements"));
check("'convulsions' -> convulsions", only("A-t-elle fait des convulsions ?", "convulsions"));
check("'est-elle agitée' -> agitation", only("Est-elle agitée ?", "agitation"));
check("'d'autres symptômes' -> symptomes_associes", only("A-t-elle d'autres symptômes ?", "symptomes_associes"));
check("'a-t-elle pris des médicaments' -> automedication only", only("A-t-elle pris des médicaments ?", "automedication"));
check("'quels comprimés' -> automedication", only("Quels comprimés a-t-elle pris ?", "automedication"));
check("'des AINS' -> automedication", asks("A-t-elle pris des AINS ?", "automedication"));
check("'médicaments habituellement' -> habitual treatment only", only("Prend-elle des médicaments habituellement ?", "medicaments_habituels"));
check("'quelque chose avant de venir' -> midazolam", only("Lui a-t-on donné quelque chose avant de venir ?", "midazolam"));
check("'du midazolam' -> midazolam", asks("A-t-elle reçu du midazolam ?", "midazolam"));
check("'des sédatifs' -> midazolam", asks("Avez-vous donné des sédatifs ?", "midazolam"));
check("'d'autres personnes malades à la maison' -> contage, not midazolam", only("D'autres personnes sont malades à la maison ?", "contage"));
check("'depuis quand ne répond-elle plus' -> consciousness only", only("Depuis quand ne répond-elle plus ?", "trouble_conscience"));
check("'allergies' -> allergies", only("A-t-elle des allergies ?", "allergies"));
check("'est-elle enceinte' -> grossesse", only("Est-elle enceinte ?", "grossesse"));
check("'dernières règles' -> grossesse", asks("Quand étaient ses dernières règles ?", "grossesse"));
check("'antécédents' -> medical history only", only("A-t-elle des antécédents ?", "atcd_medicaux"));
check("'antécédents familiaux' -> family only", only("Quels sont ses antécédents familiaux ?", "atcd_familiaux"));
check("'antécédents chirurgicaux' -> surgical only", only("Quels sont ses antécédents chirurgicaux ?", "atcd_chirurgicaux"));
check("'déjà été opérée' -> surgical", only("A-t-elle déjà été opérée ?", "atcd_chirurgicaux"));
check("'hospitalisée' -> hospitalisations", only("A-t-elle déjà été hospitalisée ?", "atcd_hospitalisations"));
check("'vaccinée' -> vaccination", only("Est-elle vaccinée ?", "vaccination"));
check("'fume, alcool' -> mode_vie", only("Fume-t-elle ou boit-elle de l'alcool ?", "mode_vie"));
check("'moustiquaire' -> prevention_palu", only("Dort-elle sous moustiquaire ?", "prevention_palu"));
check("'voyagé' -> voyage", only("A-t-elle voyagé récemment ?", "voyage"));
check("'traumatisme / chute' -> traumatisme", only("A-t-elle fait une chute ?", "traumatisme") && asks("Un traumatisme ?", "traumatisme"));
check("'toux' / 'diarrhée' / 'urines' / 'boutons' -> systems review",
  only("Toux ?", "revue_respiratoire") && only("A-t-elle de la diarrhée ?", "revue_digestive") &&
  only("Comment sont ses urines ?", "revue_urinaire") && only("A-t-elle des boutons sur la peau ?", "revue_cutanee"));
check("vitals questions do not trigger the history", matched("Quelle est sa pression artérielle ?").length === 0 && matched("Quelles sont ses constantes ?").length === 0);
check("off-topic questions match nothing", matched("Quelle est sa couleur préférée ?").length === 0 && matched("Quel est son métier ?").length === 0);
check("neck stiffness is not an 'irradiation' (family cannot tell)", matched("Y a-t-il une raideur de la nuque ?").length === 0);

// open questions, narrative and inclusion
check("open question detected", api.hasKeyword("Racontez-moi ce qui s'est passé", anamnesisConfig.questionsOuvertes));
check("'racontez' alone is not a specific question", matched("Racontez-moi ce qui s'est passé").length === 0);
check("narrative ids exist", e.etape1_anamnese.recitSpontane.every((id) => byId[id]));
check("narrative does not give away the sedative", !e.etape1_anamnese.recitSpontane.includes("midazolam"));
check("generic 'other symptoms' includes the specific negatives", byId.symptomes_associes.inclut.includes("vomissements") && byId.symptomes_associes.inclut.includes("convulsions"));
check("a compound question matches many items (engine caps the answer at 3)",
  matched("A-t-elle des allergies, été opérée, hospitalisée, vaccinée ?").length > 3);

// communication feedback
const comm = (text) => api.detectCommunication(text, anamnesisConfig);
check("greeting detected", comm("Bonjour madame").salutation === true && comm("Quel âge a-t-elle ?").salutation === false);
check("introduction detected", comm("Je suis le docteur Martin, je m'occupe d'elle").presentation === true);
check("empathy detected", comm("Je comprends votre inquiétude").empathie === true && comm("Je suis désolé pour elle").empathie === true);
check("summary detected", comm("Si je résume, elle a mal depuis cinq jours. Avez-vous autre chose à ajouter ?").synthese === true);
check("plain question shows no communication behaviour", Object.values(comm("A-t-elle de la fièvre ?")).every((v) => v === false));

// dynamic hint
const fresh = api.buildAnamnesisItems(e.etape1_anamnese, anamnesisConfig);
check("hint names an unexplored rubric", /Symptôme dominant/.test(api.buildAnamnesisHint(fresh, anamnesisConfig, e.etape1_anamnese)));
fresh.forEach((i) => { if (i.pertinence === "cle") i.revealed = true; });
check("hint says everything essential is covered", api.buildAnamnesisHint(fresh, anamnesisConfig, e.etape1_anamnese) === anamnesisConfig.indice.complet);

// --- Physical exam ---------------------------------------------------------
const examConfig = ui.examenPhysique;
const examItems = api.buildExamItems(e.etape2_examen_physique, examConfig);
const examById = (id) => examItems.find((i) => i.id === id);
check("exam catalogue merged with the case", examItems.length >= 25 && !!examById("kernig") && !!examById("ausc_cardiaque"));
check("nothing is revealed before the student acts", examItems.every((i) => i.done === false));
check("case result overrides the normal default", /Glasgow à 12\/15/.test(examById("glasgow").resultat) && !examById("glasgow").fromDefault);
check("unlisted maneuver falls back to a normal default", examById("mollets").fromDefault && /souples/.test(examById("mollets").resultat));
check("key maneuvers are the meningeal signs and Glasgow",
  ["glasgow", "raideur_nuque", "kernig", "brudzinski"].every((id) => examById(id).pertinence === "cle"));
check("no key maneuver relies on a normal default", examItems.filter((i) => i.pertinence === "cle").every((i) => !i.fromDefault));
check("no key maneuver done yet", !api.hasDoneKeyManeuver(examItems));
examById("kernig").done = true;
check("one key maneuver is enough to avoid the penalty", api.hasDoneKeyManeuver(examItems));
check("every region has maneuvers", examConfig.regions.every((r) => r.manoeuvres.length > 0));
check("maneuver ids are unique", new Set(examConfig.regions.flatMap((r) => r.manoeuvres.map((m) => m.id))).size === examConfig.regions.flatMap((r) => r.manoeuvres).length);
check("every maneuver sits on a known zone and tool",
  examItems.every((i) => examConfig.zones.some((z) => z.id === i.zone) && examConfig.outils.some((t) => t.id === api.examToolOf(i, examConfig))));
const neckNeuro = api.examItemsFor(examItems, "tete", "neuro", examConfig).map((i) => i.id);
check("neuro tool on the head finds Glasgow, neck stiffness and Brudzinski", ["glasgow", "raideur_nuque", "brudzinski"].every((id) => neckNeuro.includes(id)));
check("Kernig is found on the legs, not the head", api.examItemsFor(examItems, "membres", "neuro", examConfig).some((i) => i.id === "kernig") && !neckNeuro.includes("kernig"));
check("auscultation of the thorax gives lungs and heart", api.examItemsFor(examItems, "thorax", "ausc", examConfig).map((i) => i.id).sort().join() === "ausc_cardiaque,ausc_pulmonaire");
check("a wrong tool on a zone finds nothing", api.examItemsFor(examItems, "abdomen", "neuro", examConfig).length === 0);
check("every maneuver can be reached with some tool and zone", examItems.every((i) => api.examItemsFor(examItems, i.zone, api.examToolOf(i, examConfig), examConfig).includes(i)));
check("vitals and cardiac auscultation agree on heart rate", /86 bpm/.test(examById("ausc_cardiaque").resultat));

// --- Work-up ---------------------------------------------------------------
const exams = e.etape3_paraclinique.examensValides;
const acceptable = e.etape3_paraclinique.examensAcceptables;
check("PL recognised", api.hasKeyword("PL en urgence", exams.ponction_lombaire.motsCles));
check("GE recognised", api.hasKeyword("GE et PL", exams.goutte_epaisse.motsCles));
check("goutte épaisse (accent)", api.hasKeyword("Goutte épaisse", exams.goutte_epaisse.motsCles));
check("NFS is acceptable, not priority",
  api.hasKeyword("NFS", acceptable[0].motsCles) &&
  !api.hasKeyword("NFS", exams.ponction_lombaire.motsCles) && !api.hasKeyword("NFS", exams.goutte_epaisse.motsCles));
check("scanner is a priority exam", api.hasKeyword("un scanner cérébral", exams.imagerie_cerebrale.motsCles));
check("fond d'oeil recognised (with oe ligature and FO)",
  api.hasKeyword("un fond d'œil", exams.fond_oeil.motsCles) && api.hasKeyword("FO", exams.fond_oeil.motsCles));
check("imaging and fund exam are alternatives of the same group",
  exams.imagerie_cerebrale.groupeAlternatif === "exclusion_engagement" && exams.fond_oeil.groupeAlternatif === "exclusion_engagement");
check("LP requires that group first",
  exams.ponction_lombaire.prerequis && exams.ponction_lombaire.prerequis.groupe === "exclusion_engagement" && exams.ponction_lombaire.prerequis.malus > 0);
check("no acceptable exam clashes with a priority exam",
  acceptable.every((a) => Object.values(exams).every((x) => !a.motsCles.some((k) => api.normalize(k) === x.motsCles.map(api.normalize).find((n) => n === api.normalize(k))))));
check("nonsense exam matches nothing",
  [exams.ponction_lombaire, exams.goutte_epaisse, ...acceptable].every((x) => !api.hasKeyword("astrologie", x.motsCles)));

// --- Diagnosis ---------------------------------------------------------------
const diagnoses = e.etape4_diagnostic.diagnosticsAttendus;
check("meningo-encéphalite", api.hasKeyword("Méningo-encéphalite", diagnoses[0].motsCles));
check("paludisme grave", api.hasKeyword("paludisme grave", diagnoses[1].motsCles));
check("wrong diagnosis rejected", !diagnoses.some((d) => api.hasKeyword("grippe", d.motsCles)));

// --- Treatment ---------------------------------------------------------------
const fatal = e.etape5_traitement.erreursFatales.motsCles;
const groups = e.etape5_traitement.groupesTraitement;
check("fatal: midazolam", api.containsFatalKeyword("Je redonne du midazolam", fatal));
check("fatal: negation ignored", !api.containsFatalKeyword("pas de midazolam, ceftriaxone", fatal));
check("fatal: sédation", api.containsFatalKeyword("sédation", fatal));
check("artésunate", api.hasKeyword("Artésunate IV", groups[0].motsCles));
check("ceftriaxone", api.hasKeyword("ceftriaxone 2g", groups[1].motsCles));

// --- Score arithmetic ---------------------------------------------------------
const maxFixedLoss = e.etape2_examen_physique.malusSiOubli +
  exams.ponction_lombaire.prerequis.malus +
  diagnoses.reduce((s, d) => s + d.points, 0) + e.etape5_traitement.erreursFatales.punition;
check("fixed penalties stay below the initial score", maxFixedLoss < data.scoreInitial);

// --- Interface texts ------------------------------------------------------------
const placeholdersOk = Object.values(ui.messages).filter((m) => m.includes("{")).every((m) => /\{points\}/.test(m));
check("message templates only use {points}", placeholdersOk);
check("every step has a short name", ui.etapesCourtes.length === 6);

// --- Monitor ---------------------------------------------------------------------
const mStart = src.indexOf("const MONITOR_REFRESH_MS");
const mEnd = src.indexOf("/* Step shell");
const monitorCode = src.slice(mStart, mEnd).replace(/\/\* -+ \*\/\s*$/, "");
const calls = { strokes: 0 };
const fakeCtx = { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { calls.strokes++; } };
function fakeEl() {
  return { children: [], style: { setProperty() {} }, offsetWidth: 0, hidden: true,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } },
    append(...n) { this.children.push(...n); }, setAttribute() {}, getContext() { return fakeCtx; },
    getBoundingClientRect() { return { width: 300, height: 46 }; }, set innerHTML(v) { this.children = []; } };
}
const root = fakeEl();
const monitorApi = new Function("state", "$", "el", "document", "window", "performance", "requestAnimationFrame", "setInterval", "clearTimeout", "setTimeout",
  monitorCode + "; return {monitor, buildMonitor, refreshVitals, drawEcg, ecgSample, parseVitalNumbers, flashMonitorAlarm, formatVital};")(
  { ui, caseData: data }, () => root, () => fakeEl(), { createElement: () => fakeEl() }, { addEventListener() {}, devicePixelRatio: 1 },
  { now: () => 0 }, () => {}, () => 1, () => {}, () => 1);

check("monitor: BP parsed", JSON.stringify(monitorApi.parseVitalNumbers("112/76 mmhg")) === "[112,76]");
check("monitor: decimal comma parsed", monitorApi.parseVitalNumbers("38,5 °C")[0] === 38.5);
check("monitor: temperature format", monitorApi.formatVital("temperature", 38.5) === "38,5");
monitorApi.buildMonitor();
check("monitor: temperature of the case (38,9) is shown", monitorApi.monitor.vitals.temperature.base[0] === 38.9);
check("monitor: all six vitals displayed", Object.keys(monitorApi.monitor.vitals).length === 6);
// A case that gives no temperature must fall back to the normal default
const bareCase = JSON.parse(JSON.stringify(data));
delete bareCase.etapes.etape2_examen_physique.constantes.temperature;
delete bareCase.etapes.etape2_examen_physique.constantes.saturation;
const vitalsApi = new Function("state", monitorCode + "; return {getVitals};")({ ui, caseData: bareCase });
const fallback = vitalsApi.getVitals();
check("defaults fill missing vitals (T 37,0 and SpO2 98)", fallback.temperature === "37,0 °C" && fallback.saturation === "98% en air ambiant");
check("case values win over defaults", fallback.frequenceCardiaque === "86 bpm");
check("vitals follow monitor order", Object.keys(fallback).join() === ui.moniteur.ordre.join());
const base = {};
Object.keys(monitorApi.monitor.vitals).forEach((k) => { base[k] = monitorApi.monitor.vitals[k].base.slice(); });
let bounded = true;
for (let i = 0; i < 500; i++) {
  monitorApi.refreshVitals();
  const v = monitorApi.monitor.vitals;
  if (Math.abs(v.frequenceCardiaque.current[0] - base.frequenceCardiaque[0]) > 3) bounded = false;
  if (v.saturation.current[0] > 100) bounded = false;
  if (v.glycemieCapillaire.current[0] !== base.glycemieCapillaire[0]) bounded = false;
}
check("monitor: drift bounded, SpO2 <= 100, glucose fixed", bounded);
monitorApi.monitor.width = 300; monitorApi.monitor.height = 46; monitorApi.monitor.ctx = fakeCtx;
for (let f = 0; f < 120; f++) monitorApi.drawEcg(1 / 60);
check("monitor: ECG trace drawn", calls.strokes > 100);
monitorApi.flashMonitorAlarm();
check("monitor: alarm flashes", root.classList._s.has("alarm"));

// --- Report ------------------------------------------------------------------------
let failed = 0;
results.forEach(([name, ok]) => { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) failed++; });
console.log("\n" + (results.length - failed) + "/" + results.length + " checks passed");
process.exit(failed ? 1 : 0);
