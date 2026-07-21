import Pusher from "pusher-js";
import debounce from "p-debounce";

const KEFKA_ROLL_TEMPLATE = "systems/dimensionalwar/templates/roll.hbs";

/**
 * Classify a single raw die result using the DW crit/fail threshold bands.
 * Returns display data for both the Foundry template and IRC color tokens.
 */
function classifyRollResult(raw, die, critMult = 1, failMult = 1) {
  const divineFailMax = Math.ceil(die * 0.01 * failMult);
  const botchMax = Math.floor(die * 0.05 * failMult);
  const divineMin = Math.floor(die * (1 - 0.01 * critMult) + 1);
  const critMin = Math.floor(die * (1 - 0.05 * critMult) + 1);
  if (raw <= divineFailMax)
    return {
      cssClass: "divine-fail roll-bold",
      rCol: 4,
      pCol: 4,
      tCol: 4,
      bold: "\x02"
    };
  if (raw >= divineMin)
    return { cssClass: "divine", rCol: 10, pCol: 10, tCol: 10, bold: "" };
  if (raw <= botchMax)
    return { cssClass: "fail", rCol: 5, pCol: 4, tCol: 7, bold: "" };
  if (raw >= critMin)
    return { cssClass: "crit", rCol: 12, pCol: 12, tCol: 7, bold: "" };
  return { cssClass: "", rCol: 14, pCol: 14, tCol: 7, bold: "" };
}

/**
 * Build unified dice display data from an evaluated DiceTerm.
 * Returns template-ready dice array, pre-formatted IRC token string,
 * the overall h4 CSS class, and the tooltip grand total.
 */
function buildDiceData(
  dieTerm,
  die,
  operator,
  bonus,
  isSkillZero,
  critMult = 1,
  failMult = 1
) {
  const dice = [];
  const tokenParts = [];

  for (const r of dieTerm.results.filter(r => r.active)) {
    const raw = r.result;
    const total = isSkillZero
      ? raw
      : operator === "-"
        ? raw - bonus
        : raw + bonus;
    const cls = classifyRollResult(raw, die, critMult, failMult);
    dice.push({ result: raw, total, cssClass: cls.cssClass });
    tokenParts.push(
      `${total}:${raw}:${cls.rCol}:${cls.pCol}:${cls.tCol}:${cls.bold}`
    );
  }

  const specialDie = dice.find(d => d.cssClass);
  const overallClass = specialDie?.cssClass
    ? `roll ${specialDie.cssClass}`
    : "";
  const tooltipTotal = dice.reduce((s, d) => s + d.total, 0);

  return { dice, ircTokens: tokenParts.join(" "), overallClass, tooltipTotal };
}

/**
 * Return each die term in the roll paired with its associated operator+bonus.
 * The bonus is the first OperatorTerm+NumericTerm pair that follows the die
 * before the next die term begins.
 * DwSkillDiceTerm extends Die, so both skill and standard dice are captured.
 */
function getDieGroups(terms) {
  const groups = [];
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (!(term instanceof foundry.dice.terms.Die)) continue;
    let operator = "",
      bonus = 0;
    for (let j = i + 1; j < terms.length; j++) {
      const t = terms[j];
      if (t instanceof foundry.dice.terms.Die) break;
      if (
        t instanceof foundry.dice.terms.OperatorTerm &&
        j + 1 < terms.length &&
        terms[j + 1] instanceof foundry.dice.terms.NumericTerm
      ) {
        operator = t.operator;
        bonus = terms[j + 1].number;
        break;
      }
    }
    groups.push({ term, operator, bonus });
  }
  return groups;
}

const initPusher = async () => {
  const endpoint =
    game.settings.get("kefka-sync", "pusherAuthorizationEndpoint") || "";

  if (
    typeof game.kefkasync?.pusher !== "undefined" &&
    game.kefkasync.pusher.state === "connected"
  ) {
    game.kefkasync.pusher.disconnect();
  }

  game.kefkasync = {};

  const pusher = new Pusher(
    game.settings.get("kefka-sync", "pusherAppKey") || "",
    {
      cluster: game.settings.get("kefka-sync", "pusherCluster") || "mt1",
      channelAuthorization: {
        endpoint,
        params: {
          user_name: game.settings.get("kefka-sync", "pusherUser") || "",
          token: game.settings.get("kefka-sync", "pusherToken") || ""
        }
      }
    }
  );

  const rollDiceChannel = pusher.subscribe("private-foundry-roll-dice");

  await new Promise(resolve => {
    rollDiceChannel.bind("pusher:subscription_succeeded", () => {
      resolve();
    });
  });

  game.kefkasync = {
    pusher,
    rollDiceChannel
  };
};
const initPusherDebounce = debounce(async () => {
  await initPusher();
}, 600);

Hooks.once("init", () => {
  game.settings.register("kefka-sync", "pusherAppKey", {
    scope: "world",
    config: true,
    name: "Pusher App Key",
    hint: "The app key for PusherJs",
    type: String,
    default: "",
    onChange() {
      initPusherDebounce();
    }
  });
  game.settings.register("kefka-sync", "pusherCluster", {
    scope: "world",
    config: true,
    name: "Pusher Cluster",
    hint: "The cluster for PusherJs",
    type: String,
    choices: {
      mt1: "N. Virginia (mt1)",
      us2: "Ohio (us2)",
      us3: "Oregon (us3)",
      eu: "Ireland (eu)",
      ap1: "Singapore (ap1)",
      ap2: "Mumbai (ap2)",
      ap3: "Tokyo (ap3)",
      ap4: "Sydney (ap4)",
      sa1: "Sao Paulo (sa1)"
    },
    default: "mt1",
    onChange() {
      initPusherDebounce();
    }
  });
  game.settings.register("kefka-sync", "pusherAuthorizationEndpoint", {
    scope: "world",
    config: true,
    name: "Pusher Authorization Endpoint",
    hint: "The authorization endpoint for PusherJs",
    type: String,
    onChange() {
      initPusherDebounce();
    }
  });
  game.settings.register("kefka-sync", "pusherUser", {
    scope: "world",
    config: true,
    name: "Pusher Authorization User",
    hint: "The authorization user name as defined in the phpBB WSAUTH config for PusherJs",
    type: String,
    onChange() {
      initPusherDebounce();
    }
  });
  game.settings.register("kefka-sync", "pusherToken", {
    scope: "world",
    config: true,
    name: "Pusher Authorization Token",
    hint: "The authorization token for the user as defined in the phpBB WSAUTH config for PusherJs",
    type: String,
    onChange() {
      initPusherDebounce();
    }
  });
  game.settings.register("kefka-sync", "ircChannel", {
    scope: "world",
    config: true,
    name: "Irc Channel",
    hint: "The active irc channel for the game",
    type: String
  });
  game.settings.register("kefka-sync", "ircGmNickname", {
    scope: "world",
    config: true,
    name: "Irc GM Nickname",
    hint: "The active irc nickname for the GM of the game",
    type: String
  });
});

Hooks.once("ready", async () => {
  if (game.user.id === game.users.activeGM.id) {
    await initPusher();
    game.kefkasync.rollDiceChannel.bind(
      "client-roll-dice-result",
      async data => {
        let { reason, rollMode, die, baseRoll, roll, rolls, user, nick } = data;
        if (baseRoll === roll) {
          baseRoll = undefined;
        }
        // Classify each die result and build template + IRC token data
        const dice = rolls.map(([result, total]) => ({
          result,
          total,
          cssClass: classifyRollResult(result, die).cssClass
        }));
        const specialDie = dice.find(d => d.cssClass);
        const overallClass = specialDie?.cssClass
          ? `roll ${specialDie.cssClass}`
          : "";
        const tooltipTotal = dice.reduce((s, d) => s + d.total, 0);

        // Reconstruct a minimal Roll so message.isRoll = true (enables collapsibility).
        // The actual display comes from custom content below.
        // Use Roll.create + evaluate (the safe API) inside a try-catch so any failure
        // degrades gracefully — the message still appears, just without collapse support.
        let rollMeta = null;
        try {
          rollMeta = await Roll.create(roll);
          await rollMeta.evaluate({ async: true });
        } catch (e) {
          console.warn(
            "kefka-sync | Could not build roll metadata for collapsibility:",
            e
          );
          rollMeta = null;
        }

        const content = await renderTemplate(KEFKA_ROLL_TEMPLATE, {
          rollGroups: [
            {
              formulaLines: baseRoll ? [baseRoll, roll] : [roll],
              dice,
              overallClass,
              tooltipTotal,
              reason: reason || null
            }
          ]
        });

        await ChatMessage.create(
          {
            content,
            rolls: rollMeta ? [rollMeta] : undefined,
            user,
            speaker: { alias: nick },
            flags: { "kefka-sync": { fromIrc: true } },
            whisper:
              rollMode === "gmroll"
                ? [game.users.activeGM.id, !!user ? user : undefined]
                : undefined
          },
          { rollMode }
        );
      }
    );
  }
});

Hooks.once("diceSoNiceReady", () => {
  game.dice3d.messageHookDisabled = true;
});

// Apply the roll template to Foundry-originated roll messages so they
// share the same card format as IRC results (per-die coloration, s-notation, etc.).
Hooks.on("renderChatMessageHTML", (message, html) => {
  // IRC results already have custom content; skip them
  if (message.getFlag?.("kefka-sync", "fromIrc")) return;
  if (!message.isRoll || !message.rolls?.length) return;

  const allRollGroups = [];

  for (const roll of message.rolls) {
    if (!roll?.terms) continue;

    const dieGroups = getDieGroups(roll.terms);
    if (!dieGroups.length) continue;

    const critMult = roll.options?.critMult ?? 1;
    const failMult = roll.options?.failMult ?? 1;
    const rollFlavor = roll.options?.flavor || roll.flavor || "";

    const rollGroups = dieGroups
      .filter(({ term }) => term.results?.length > 0)
      .map(({ term, operator, bonus }) => {
        const die = term.faces;
        const isSkillZero =
          term.constructor?.DENOMINATION === "s" && term.skillLevel === 0;
        const { dice, overallClass, tooltipTotal } = buildDiceData(
          term,
          die,
          operator,
          bonus,
          isSkillZero,
          critMult,
          failMult
        );
        const dieFlavor = term.options?.flavor || term.options?.flavour || "";

        const num = term.number ?? 1;
        const bonusStr = bonus > 0 ? `${operator}${bonus}` : "";
        const sFml =
          (term.constructor?.DENOMINATION === "s" &&
          term.skillLevel !== undefined
            ? `${num}s${term.skillLevel}`
            : `${num}d${term.faces}`) + bonusStr;
        const dFml = `${num}d${term.faces}${bonusStr}`;
        const formulaLines = sFml !== dFml ? [sFml, dFml] : [sFml];

        return {
          formulaLines,
          dice,
          overallClass,
          tooltipTotal,
          reason: dieFlavor || null
        };
      });

    // Per-roll flavor fallback: use roll.options.flavor (set by DwRoll.propagateFlavor)
    if (rollGroups.length && !rollGroups.some(g => g.reason) && rollFlavor) {
      rollGroups[0].reason = rollFlavor;
    }

    allRollGroups.push(...rollGroups);
  }

  if (!allRollGroups.length) return;

  // Final message-level fallback for single-roll messages with no inline flavor
  if (!allRollGroups.some(g => g.reason) && message.flavor) {
    allRollGroups[0].reason = message.flavor;
  }

  const templateFn = Handlebars.partials[KEFKA_ROLL_TEMPLATE];
  if (!templateFn) return;

  const rendered = templateFn({ rollGroups: allRollGroups });
  const diceRollEls = html.querySelectorAll(".dice-roll");
  if (!diceRollEls.length) return;

  // Replace the first native block with the combined custom card, then
  // remove any remaining native blocks (one per roll in a multi-roll message).
  diceRollEls[0].outerHTML = rendered;
  html.querySelectorAll(".dice-roll").forEach((el, i) => {
    if (i > 0) el.remove();
  });
});

Hooks.on("createChatMessage", async (...args) => {
  const [chatMessage, { rollMode }] = args;
  if (!chatMessage.isRoll) return;
  // Skip messages that originated from IRC to prevent echo loops
  if (chatMessage.getFlag("kefka-sync", "fromIrc")) return;
  // Only the client with an active Pusher connection echoes to IRC.
  // Pusher is only initialized for the GM (in the ready hook), so this
  // naturally prevents duplicate triggers from other connected clients.
  if (
    game.kefkasync?.pusher?.connection?.state !== "connected" ||
    !game.kefkasync?.rollDiceChannel?.subscribed
  )
    return;

  const ircChannel = game.settings.get("kefka-sync", "ircChannel") || "";
  const ircGmNickname = game.settings.get("kefka-sync", "ircGmNickname") || "";
  if (!ircChannel || !ircGmNickname) return;

  if (!chatMessage.rolls?.length) return;

  // Collect groups across all rolls in the message (a macro can produce a
  // ChatMessage with multiple rolls — e.g. `/r 1s2+30` and `/r 1d3+2` sent
  // together will land in chatMessage.rolls[0] and chatMessage.rolls[1]).
  const groupData = [];
  for (const roll of chatMessage.rolls) {
    if (!roll?.terms) continue;
    const rollGroups = getDieGroups(roll.terms);
    if (!rollGroups.length) continue;

    const critMult = roll.options?.critMult ?? 1;
    const failMult = roll.options?.failMult ?? 1;
    const rollFlavor = roll.options?.flavor || roll.flavor || "";

    const processed = rollGroups
      .filter(({ term }) => term.results?.length > 0)
      .map(({ term, operator, bonus }) => {
        const die = term.faces;
        const diceNum = term.number ?? 1;
        const isSkillZero =
          term.constructor?.DENOMINATION === "s" && term.skillLevel === 0;
        const { ircTokens } = buildDiceData(
          term,
          die,
          operator,
          bonus,
          isSkillZero,
          critMult,
          failMult
        );
        const dieFlavor = term.options?.flavor || term.options?.flavour || "";
        const bonusStr = bonus > 0 ? String(bonus) : "";
        return {
          die,
          diceNum,
          operator,
          bonus: bonusStr,
          ircTokens,
          reason: dieFlavor
        };
      });

    // Per-roll flavor fallback: when no die carries inline flavor, use the
    // roll-level flavor (from `# text` in the chat command) for the first group.
    if (processed.length && !processed.some(g => g.reason) && rollFlavor) {
      processed[0].reason = rollFlavor;
    }

    groupData.push(...processed);
  }

  if (!groupData.length) return;

  // Fall back to message-level flavor for the first group when no die carries inline flavor
  if (!groupData.some(g => g.reason) && chatMessage.flavor) {
    groupData[0].reason = chatMessage.flavor;
  }

  const gmRoll = ["gmroll", "blindroll", "selfroll"].includes(rollMode);

  game.kefkasync.rollDiceChannel.trigger("client-foundry-roll-echo", {
    nick: chatMessage.speaker?.alias || game.user.name,
    user: chatMessage.author?.id,
    rollMode,
    gmRoll,
    target: !gmRoll ? ircChannel : ircGmNickname,
    rolls: groupData.map(g => g.ircTokens),
    reasons: groupData.map(g => g.reason),
    formulas: groupData.map(g => `${g.diceNum}d${g.die}${g.operator}${g.bonus}`)
  });
});
