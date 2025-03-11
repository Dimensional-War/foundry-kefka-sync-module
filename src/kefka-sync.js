import Pusher from "pusher-js";
import debounce from "p-debounce";
import { SkillDieTerm } from "./dice/SkillDieTerm";
import { SkillRoll } from "./dice/SkillRoll";

const initPusher = () => {
  const endpoint =
    game.settings.get("kefka-sync", "pusherAuthorizationEndpoint") || "";

  if (
    typeof game.kefkasync?.pusher !== "undefined" &&
    game.kefkasync.pusher.state === "connected"
  ) {
    game.kefkasync.pusher.disconnect();
  }

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

  game.kefkasync = {
    pusher,
    rollDiceChannel
  };
};
const initPusherDebounce = debounce(initPusher, 600);

/**
 * Parse a chat string to identify the chat command (if any) which was used
 * @param {string} message    The message to match
 * @returns {string[]}        The identified command and regex match
 */
function parseRoll(message) {
  const dice = "([^#]+)(?:#(.*))?";
  const modes = {
    roll: new RegExp(`^(\\/r(?:oll)? )${dice}$`, "i"), // Regular rolls: /r or /roll
    gmroll: new RegExp(`^(\\/gmr(?:oll)? )${dice}$`, "i"), // GM rolls: /gmr or /gmroll
    blindroll: new RegExp(`^(\\/b(?:lind)?r(?:oll)? )${dice}$`, "i"), // Blind rolls: /br or /blindroll
    selfroll: new RegExp(`^(\\/s(?:elf)?r(?:oll)? )${dice}$`, "i"), // Self rolls: /sr or /selfroll
    publicroll: new RegExp(`^(\\/p(?:ublic)?r(?:oll)? )${dice}$`, "i") // Public rolls: /pr or /publicroll
  };
  const MULTILINE_COMMANDS = new Set([
    "roll",
    "gmroll",
    "blindroll",
    "selfroll",
    "publicroll"
  ]);
  for (const [rule, rgx] of Object.entries(modes)) {
    // For multi-line matches, the first line must match
    if (MULTILINE_COMMANDS.has(rule)) {
      const lines = message.split("\n");
      if (rgx.test(lines[0])) return [rule, lines.map(l => l.match(rgx))];
    }

    // For single-line matches, match directly
    else {
      const match = message.match(rgx);
      if (match) return [rule, match];
    }
  }
}

CONFIG.Dice.termTypes["SkillDieTerm"] = SkillDieTerm;
CONFIG.Dice.rolls.splice(0, 1, SkillRoll);

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
    initPusher();
    game.kefkasync.rollDiceChannel.bind(
      "client-roll-dice-result",
      async data => {
        let { reason, rollMode, die, baseRoll, roll, rolls, user, nick } = data;
        // if (game.user.id !== user && user !== "") {
        //   return;
        // }
        if (baseRoll === roll) {
          baseRoll = undefined;
        }
        const rollReason = !!reason ? `[${reason}]` : "";
        const botRolls = [];
        for (const r of rolls) {
          const [result, total] = r;
          let bold = false;
          let className = "roll";
          if (result <= Math.ceil(die * 0.01)) {
            bold = true;
            className += " divine-fail";
          } else if (result >= Math.floor(die * 0.99 + 1)) {
            className += " divine";
          } else if (result <= Math.floor(die * 0.05)) {
            className += " fail";
          } else if (result >= Math.floor(die * 0.95 + 1)) {
            className += " crit";
          }
          className += ` ${bold ? "roll-bold" : ""}`;
          botRolls.push({
            className,
            result,
            total
          });
        }
        const rollTotalClassName =
          botRolls.find(({ className }) => {
            return (
              className.includes("divine-fail") ||
              className.includes("divine") ||
              className.includes("fail") ||
              className.includes("crit")
            );
          })?.className || "";

        await ChatMessage.create(
          {
            content: `
            <div class="dice-roll">
              <div class="dice-result">
                <div class="dice-formula">
                  ${!!baseRoll ? `<div>${baseRoll}${rollReason}</div>` : ""}
                  ${
                    !baseRoll
                      ? `<div>${roll}${rollReason}</div>`
                      : `<div>${roll}</div>`
                  }
                </div>
                <div class="dice-tooltip">
                  <section class="tooltip-part">
                    ${botRolls.reduce((carry, { total }) => carry + total, 0)}
                  </section>
                </div>

                <h4 class="dice-total ${rollTotalClassName}">
                  <div class="dice">
                    <ol class="dice-rolls">
                      ${botRolls
                        .map(({ className, result, total }) => {
                          return `<li class="${className}">
                            <span class="result">${result}</span>
                            <span class="roll-flex paren-total">
                              <span class="paren">(</span>
                              <span class="total">${total}</span>
                              <span class="paren">)</span>
                            </span>
                          </li>`;
                        })
                        .join("\n")}
                    </ol>
                  </div>
                </h4>
              </div>
            </div>
              `,
            user,
            speaker: {
              alias: nick
            },
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

Hooks.on("createChatMessage", async (...args) => {
  const [chatMessage, { rollMode }] = args;
  if (chatMessage.isRoll) {
    if (
      game.kefkasync.pusher.connection.state === "connected" &&
      game.kefkasync.rollDiceChannel.subscribed
    ) {
      await chatMessage.setFlag("kefka-sync", "diceRolling", true);
      await chatMessage.setFlag("kefka-sync", "rollMode", rollMode);
    }
  }
});

Hooks.on("chatMessage", (...args) => {
  const [_chatLog, message, chatData] = args;
  if (game.user.id !== chatData.user) {
    return;
  }
  const channel = game.kefkasync.rollDiceChannel;
  let ircChannel = game.settings.get("kefka-sync", "ircChannel") || "";
  let ircGmNickname = game.settings.get("kefka-sync", "ircGmNickname") || "";
  let gmRoll = false;
  let rollMode = "";

  let [command, _match] = parseRoll(message);

  switch (command) {
    case "roll":
    case "gmroll":
    case "blindroll":
    case "selfroll":
    case "publicroll":
      rollMode = command;
      break;
  }

  switch (command) {
    case "gmroll":
    case "blindroll":
    case "selfroll":
      gmRoll = true;
      break;
  }

  if (ircChannel !== "" && ircGmNickname !== "") {
    const match = message.match(
      /(?<dieAmount>\d*)(?<dieType>s|d)(?<die>\d+)((?<operator>[+\-])(?<bonus>[1-9]\d*))?(\[(?<reason>.*)\])?/i
    );
    if (match !== null) {
      const { dieAmount, dieType, die, operator, bonus, reason } = match.groups;

      let roll = dieAmount !== "" ? dieAmount : 1;
      roll += `${dieType}${die}`;
      roll += !!operator ? operator : "";
      roll += !!bonus ? bonus : "";
      roll += !!reason ? " " + reason : "";

      channel.trigger("client-do-roll-dice", {
        rollMode,
        gmRoll,
        target: !gmRoll ? ircChannel : ircGmNickname,
        nick: chatData.speaker.alias,
        user: chatData.user,
        roll
      });
    }
  }
});

Hooks.on("renderChatMessage", (chatMessage, html, data) => {
  if (chatMessage.getFlag("kefka-sync", "diceRolling") || false) {
    html.css("display", "none");
  }
});
