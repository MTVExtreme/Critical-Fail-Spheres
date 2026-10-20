import { api as guileApi } from "./src/guile/index.mjs";
import { registerExtraSpheres } from "./src/guile/extra-spheres.mjs";
import { registerGuileSheetUI } from "./src/guile/sheet.mjs";

const MODULE_ID = "critical-fail-spheres";

if (!globalThis.__cfSpheresEngineLoaded) {
  await import("./pf1spheres-engine.js");
}
await import("./v14-compat.mjs");

registerExtraSpheres();

const COMPENDIUM_FROM = "Compendium.pf1spheres.";
const COMPENDIUM_TO = "Compendium.critical-fail-spheres.";

function rewritten(data) {
  const json = JSON.stringify(data);
  if (!json.includes(COMPENDIUM_FROM)) return null;
  return JSON.parse(json.replaceAll(COMPENDIUM_FROM, COMPENDIUM_TO));
}

async function migrateDocument(doc) {
  const embeddedKeys = ["items", "effects", "pages", "tokens"].filter((key) => doc[key]?.[Symbol.iterator]);
  try {
    const source = doc.toObject();
    const top = { ...source };
    for (const key of embeddedKeys) delete top[key];
    const nextTop = rewritten(top);
    if (nextTop) {
      const diff = foundry.utils.diffObject(top, nextTop);
      delete diff._id;
      if (!foundry.utils.isEmpty(diff)) await doc.update(diff, { pf1: { action: "migration" } });
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Could not rewrite ${doc.uuid}`, error);
  }
  for (const key of embeddedKeys) {
    for (const child of doc[key]) await migrateDocument(child);
  }
}

function isOurPack(pack) {
  return pack.metadata?.packageName === MODULE_ID || String(pack.metadata?.id ?? "").startsWith(`${MODULE_ID}.`);
}

async function migrateOwnedSpheres() {
  if (game.settings.get(MODULE_ID, "compendiumLinksMigrated")) return;
  const collections = [game.actors, game.items, game.journal, game.scenes, game.macros, game.tables];
  for (const collection of collections) {
    for (const doc of collection ?? []) await migrateDocument(doc);
  }
  for (const pack of game.packs) {
    if (!isOurPack(pack)) continue;
    const locked = pack.locked;
    if (locked) await pack.configure({ locked: false });
    for (const doc of await pack.getDocuments()) await migrateDocument(doc);
    if (locked) await pack.configure({ locked: true });
  }
  await game.settings.set(MODULE_ID, "compendiumLinksMigrated", true);
  console.log(`${MODULE_ID} | Compendium links now point at Critical Fail Spheres`);
}

async function retireOriginalModule() {
  const current = game.settings.get("core", "moduleConfiguration");
  if (!current?.pf1spheres) return;
  await game.settings.set("core", "moduleConfiguration", { ...current, pf1spheres: false });
  ui.notifications?.info("Spheres of Power is now Critical Fail Spheres. Reload the world once so the old module stays off.");
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "compendiumLinksMigrated", {
    name: "Spheres compendium links migrated",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, "enableGuileTab", {
    name: "Show Spheres of Guile",
    hint: "Lists skill spheres, talent counts, and granted skill ranks on the Spheres tab.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  console.log(`${MODULE_ID} | Initialized`);
});

Hooks.once("pf1PostInit", () => {
  registerGuileSheetUI();
});

Hooks.once("ready", () => {
  if (!game.user.isActiveGM) return;
  const wait = globalThis.__cfV14Migration ?? Promise.resolve();
  wait
    .then(() => migrateOwnedSpheres())
    .then(() => retireOriginalModule())
    .catch((error) => console.error(`${MODULE_ID} | Spheres takeover`, error));
});

Hooks.once("setup", () => {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = {
    id: MODULE_ID,
    guile: guileApi,
    config: globalThis.pf1s?.config,
  };
});
