export function createObserverAvatarSceneDomain(options = {}) {
  const {
    fs = null,
    pathModule = null,
    publicRoot = ""
  } = options;

  function defaultAppRoomTextures() {
    return {
      walls: "",
      floor: "",
      ceiling: "",
      windowFrame: ""
    };
  }

  function defaultAppPropSlots() {
    return {
      backWallLeft: { model: "", scale: 1 },
      backWallRight: { model: "", scale: 1 },
      wallLeft: { model: "", scale: 1 },
      wallRight: { model: "", scale: 1 },
      besideLeft: { model: "", scale: 1 },
      besideRight: { model: "", scale: 1 },
      outsideLeft: { model: "", scale: 1 },
      outsideRight: { model: "", scale: 1 }
    };
  }

  function defaultAppReactionPathsByModel() {
    const defaultPaths = {
      idle: "Charged_Ground_Slam",
      calm: "Cheer_with_Both_Hands_Up",
      agree: "Talk_with_Left_Hand_Raised",
      angry: "Head_Hold_in_Pain",
      love: "Agree_Gesture",
      celebrate: "Angry_Stomp",
      confused: "Walking",
      dance: "Idle_3",
      sass: "Big_Heart_Gesture",
      hurt: "Scheming_Hand_Rub",
      reflect: "Idle_6",
      run: "Shrug",
      scheme: "Wave_One_Hand",
      shrug: "Confused_Scratch",
      rant: "Stand_Talking_Angry",
      passionate: "Mirror_Viewing",
      explain: "FunnyDancing_01",
      walk: "Hand_on_Hip_Gesture",
      wave: "Talk_Passionately",
      slam: "Running"
    };
    return {
      "/assets/characters/Nova.glb": {
        idleClip: defaultPaths.idle,
        talkingClips: [
          "Mirror_Viewing",
          "Talk_with_Left_Hand_Raised",
          "FunnyDancing_01"
        ],
        paths: defaultPaths
      }
    };
  }

  function normalizePropScale(value, fallback = 1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  function normalizeReactionPathProfile(value = {}) {
    const rawPaths = value?.paths && typeof value.paths === "object"
      ? value.paths
      : value;
    const paths = Object.fromEntries(
      Object.entries(rawPaths && typeof rawPaths === "object" ? rawPaths : {})
        .map(([emotion, clip]) => [String(emotion || "").trim().toLowerCase(), String(clip || "").trim()])
        .filter(([emotion, clip]) => emotion && clip)
    );
    const idleClip = String(value?.idleClip || paths.idle || value?.idle || "").trim();
    if (idleClip) {
      paths.idle = idleClip;
    }
    return {
      idleClip,
      talkingClips: Array.isArray(value?.talkingClips)
        ? value.talkingClips.map((clip) => String(clip || "").trim()).filter(Boolean)
        : [],
      paths
    };
  }

  function normalizeReactionPathsByModel(value, allowedModelPaths = []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaultAppReactionPathsByModel();
    }
    const allowed = new Set((Array.isArray(allowedModelPaths) ? allowedModelPaths : []).map((entry) => String(entry || "").trim()).filter(Boolean));
    const entries = Object.entries(value)
      .map(([modelPath, profile]) => [String(modelPath || "").trim(), normalizeReactionPathProfile(profile)])
      .filter(([modelPath]) => !allowed.size || allowed.has(modelPath));
    return entries.length ? Object.fromEntries(entries) : defaultAppReactionPathsByModel();
  }

  function normalizeStylizationFilterPreset(value, fallback = "none") {
    const normalized = String(value || "").trim().toLowerCase();
    return [
      "none",
      "soft",
      "cinematic",
      "noir",
      "vivid",
      "dream",
      "retro_vhs",
      "haunted",
      "surveillance",
      "crystal",
      "whimsical",
      "toon",
      "anime"
    ].includes(normalized) ? normalized : fallback;
  }

  function normalizeStylizationEffectPreset(value, fallback = "none") {
    const normalized = String(value || "").trim().toLowerCase();
    return [
      "none",
      "toon",
      "dream",
      "retro_vhs",
      "whimsical",
      "glow",
      "grain",
      "comic"
    ].includes(normalized) ? normalized : fallback;
  }

  async function walkAssetDirectory(dirPath, relativePrefix = "") {
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }
    const files = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = pathModule.join(dirPath, entry.name);
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push(...await walkAssetDirectory(entryPath, relativePath));
        continue;
      }
      if (entry.isFile()) {
        files.push(relativePath.replaceAll("\\", "/"));
      }
    }
    return files;
  }

  async function listPublicAssetChoices() {
    const files = await walkAssetDirectory(pathModule.join(publicRoot, "assets"));
    const toPublicPath = (fileName) => `/assets/${fileName}`;
    const filterByPath = (pattern) => files
      .filter((name) => pattern.test(name))
      .sort((left, right) => left.localeCompare(right))
      .map(toPublicPath);
    const characters = filterByPath(/^characters\/.+\.glb$/i);
    const props = filterByPath(/^props\/.+\.glb$/i);
    const skies = filterByPath(/^skies\/.+\.(png|jpg|jpeg)$/i);
    const textures = filterByPath(/^textures\/.+\.(png|jpg|jpeg)$/i);
    return {
      characters,
      props,
      skies,
      textures,
      models: characters,
      backgrounds: skies
    };
  }

  return {
    defaultAppPropSlots,
    defaultAppReactionPathsByModel,
    defaultAppRoomTextures,
    listPublicAssetChoices,
    normalizePropScale,
    normalizeReactionPathsByModel,
    normalizeStylizationEffectPreset,
    normalizeStylizationFilterPreset
  };
}
