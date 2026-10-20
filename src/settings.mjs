const MODULE_ID = "critical-fail-spheres";

export function isGuileTabEnabled() {
  return game.settings.get(MODULE_ID, "enableGuileTab") !== false;
}
