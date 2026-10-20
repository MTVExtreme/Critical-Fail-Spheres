/**
 * Foundry v14 adjustments for Spheres of Power.
 * The sheet, feature groups, and caster totals are patched here so the
 * minified engine can stay in place.
 */
if (!globalThis.__cfSpheresV14) {
  globalThis.__cfSpheresV14 = true;

  const TALENT_SECTIONS = {
    combatTalent: { labelKey: "PF1SPHERES.CombatTalentPlural", subType: "combatTalent", sort: 2400 },
    magicTalent: { labelKey: "PF1SPHERES.MagicTalentPlural", subType: "magicTalent", sort: 2500 },
    skillTalent: { labelKey: "PF1SPHERES.SkillTalentPlural", subType: "skillTalent", sort: 2600 },
  };

  function registerTalentSections() {
    const features = pf1.config.sheetSections?.features;
    if (!features) return;
    for (const [id, def] of Object.entries(TALENT_SECTIONS)) {
      const label = game.i18n?.has?.(def.labelKey) ? game.i18n.localize(def.labelKey) : def.labelKey;
      features[id] = {
        label,
        category: "features",
        id,
        path: `features.${id}`,
        sort: def.sort,
        filters: [{ type: "feat", subTypes: [def.subType] }],
        interface: { create: true, actions: true, types: true },
        create: { type: "feat", system: { subType: def.subType } },
      };
    }
  }

  function spherePaths() {
    const config = globalThis.pf1s?.config;
    if (!config) return [];
    const paths = [
      "system.spheres.cl.total",
      "system.spheres.cl.modCap",
      "system.spheres.cam",
      "system.spheres.pam",
      "system.spheres.oam",
      "system.spheres.msb.total",
      "system.spheres.msb.base",
      "system.spheres.msd.total",
      "system.spheres.msd.base",
      "system.spheres.concentration.total",
    ];
    for (const key of Object.keys(config.magicSpheres ?? {})) {
      paths.push(`system.spheres.cl.${key}.total`, `system.spheres.cl.${key}.modCap`);
    }
    for (const key of Object.keys(config.combatSpheres ?? {})) {
      paths.push(`system.spheres.bab.${key}.total`);
    }
    return paths;
  }

  function blankOverride() {
    const result = { add: Object.create(null), set: Object.create(null) };
    for (const type of Object.keys(pf1.config.bonusTypes)) {
      result.add[type] = { value: null, sources: [] };
      result.set[type] = { value: null, sources: [] };
    }
    return result;
  }

  function ensureSphereOverrides(actor) {
    const overrides = actor?.changeOverrides;
    if (!overrides || !actor.system?.spheres) return;
    for (const path of spherePaths()) {
      if (!overrides[path]) overrides[path] = blankOverride();
    }
  }

  /**
   * Fill caster numbers that are still zero after the change pass.
   * A successful change leaves a positive total alone.
   * @param {Actor} actor
   */
  function publishSphereTotals(actor) {
    const spheres = actor.system?.spheres;
    const config = globalThis.pf1s?.config;
    if (!spheres || !config) return;

    const hd = Number(actor.system.attributes?.hd?.total) || 0;
    const clBase = Number(spheres.cl?.base) || 0;
    const clCap = Number(spheres.cl?.modCap) || 0;
    const msbBase = Number(spheres.msb?.base) || 0;
    const msdBase = Number(spheres.msd?.base) || 0;
    if (!(Number(spheres.msb?.total) > 0) && msbBase) spheres.msb.total = msbBase;
    if (!(Number(spheres.msd?.total) > 0) && msdBase) spheres.msd.total = msdBase;

    const clTotal = Math.min(hd, clBase + clCap);
    if (!(Number(spheres.cl?.total) > 0) && clTotal) spheres.cl.total = clTotal;

    for (const key of Object.keys(config.magicSpheres ?? {})) {
      const entry = spheres.cl?.[key];
      if (!entry || Number(entry.total) > 0) continue;
      const cap = Number(entry.modCap) || 0;
      const total = Math.min(hd, clBase + clCap + cap);
      if (total) entry.total = total;
    }

    const bab = Number(actor.system.attributes?.bab?.total) || 0;
    for (const key of Object.keys(config.combatSpheres ?? {})) {
      const entry = spheres.bab?.[key];
      if (!entry || Number(entry.total) > 0 || !bab) continue;
      entry.total = bab;
    }

    if (!(Number(spheres.concentration?.total) > 0)) {
      const abilityId = actor.flags?.pf1spheres?.castingAbility;
      const mod = abilityId ? Number(actor.system.abilities?.[abilityId]?.mod) || 0 : 0;
      const total = (Number(spheres.msb?.total) || 0) + mod;
      if (total) spheres.concentration.total = total;
    }
  }

  const SPHERES_PART = {
    template: "modules/critical-fail-spheres/templates/spheres-part.hbs",
    scrollable: [""],
  };

  function installSpheresTab(sheetClass) {
    if (!sheetClass?.PARTS || sheetClass.PARTS.spheres) return;
    sheetClass.PARTS.spheres = SPHERES_PART;
    const tabs = sheetClass.TABS?.primary?.tabs;
    if (!tabs || tabs.some((tab) => tab.id === "spheres")) return;
    const notes = tabs.findIndex((tab) => tab.id === "notes");
    const entry = { id: "spheres", label: "PF1SPHERES.SpherePlural" };
    if (notes >= 0) tabs.splice(notes + 1, 0, entry);
    else tabs.push(entry);
  }

  function installSpheresTabs() {
    const actorApps = pf1.applications?.actor;
    installSpheresTab(actorApps?.abstract?.BaseCharacterSheetPF);
    installSpheresTab(actorApps?.CharacterSheetPF);
    installSpheresTab(actorApps?.NPCSheetPF);
  }

  /**
   * The engine appends its own panel beside the navigation, which drops the tab bar
   * under the list. The real sheet part is rendered with the other tabs, so the
   * engine markup is moved into that part.
   */
  function placeSpheresTab(root) {
    if (!(root instanceof Element)) return;
    const host = root.querySelector('[data-application-part="spheres"]');
    const injected = [...root.querySelectorAll(".tab.spheres")].filter((el) => el !== host && !host?.contains(el));
    if (host && injected[0]) {
      host.replaceChildren(...injected[0].childNodes);
      injected[0].remove();
      for (const extra of injected.slice(1)) extra.remove();
    }
    const links = [...root.querySelectorAll('nav.sheet-navigation[data-group="primary"] > [data-tab="spheres"]')];
    for (const link of links.slice(1)) link.remove();
  }

  Hooks.on("pf1.rollData", (actor, data) => {
    if (actor?.system?.spheres) data.spheres = actor.system.spheres;
  });

  Hooks.on("pf1.actor.prepareDerivedData", (actor) => {
    try {
      publishSphereTotals(actor);
    } catch (error) {
      console.error("pf1spheres | Could not publish sphere totals", error);
    }
  });

  Hooks.on("renderActorSheetPF", (_app, element) => {
    const root = element instanceof HTMLElement ? element : element?.[0] ?? element?.get?.(0);
    placeSpheresTab(root);
  });

  Hooks.once("init", () => {
    installSpheresTabs();
    registerTalentSections();
    const actorClass = CONFIG.Actor?.documentClass;
    const original = actorClass?.prototype?._prepareChanges;
    if (typeof original === "function" && !original.__cfSpheresWrapped) {
      function wrappedPrepareChanges(...args) {
        const result = original.apply(this, args);
        try {
          ensureSphereOverrides(this);
        } catch (error) {
          console.error("pf1spheres | Could not register sphere change targets", error);
        }
        return result;
      }
      wrappedPrepareChanges.__cfSpheresWrapped = true;
      actorClass.prototype._prepareChanges = wrappedPrepareChanges;
    }
  });

  Hooks.once("setup", () => {
    registerTalentSections();
  });
}
