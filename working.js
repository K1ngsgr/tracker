require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { Web3 } = require("web3");
const fs = require("fs");

// ================= EXPRESS =================

const app = express();

app.get("/", (req, res) => {
  res.send("USDT Tracker Running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌍 Server Running");
});

// ================= TELEGRAM =================

console.log("🤖 Starting Telegram Bot...");

const bot = new TelegramBot(
  process.env.BOT_TOKEN,
  {
    polling: true
  }
);

bot.deleteWebHook();

bot.on(
  "polling_error",
  (err) => {

    console.log(
      "❌ POLLING ERROR:",
      err.message
    );

  }
);

bot.getMe()
  .then((me) => {

    console.log(
      `✅ Telegram Connected: ${me.username}`
    );

  })
  .catch((err) => {

    console.log(
      "❌ TELEGRAM ERROR:",
      err.message
    );

  });

// ================= WEB3 =================

const web3 = new Web3(
  process.env.HTTP_RPC
);

const USDT =
  "0x55d398326f99059fF775485246999027B3197955";

// ================= FILES =================

if (!fs.existsSync("users.json")) {
  fs.writeFileSync(
    "users.json",
    "[]"
  );
}

if (!fs.existsSync("wallets.json")) {
  fs.writeFileSync(
    "wallets.json",
    "[]"
  );
}

// ================= JSON =================

function loadJSON(file) {

  try {

    const raw =
      fs.readFileSync(
        file,
        "utf8"
      );

    if (!raw) {
      return [];
    }

    const data =
      JSON.parse(raw);

    if (
      !Array.isArray(data)
    ) {
      return [];
    }

    return data;

  } catch {

    return [];
  }
}

function saveJSON(file, data) {

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

// ================= USERS =================

function ensureUser(id) {

  let users =
    loadJSON(
      "users.json"
    );

  if (
    !users.includes(id)
  ) {

    users.push(id);

    saveJSON(
      "users.json",
      users
    );
  }
}

// ================= WALLETS =================

function getWallets() {

  let wallets =
    loadJSON(
      "wallets.json"
    );

  if (
    !Array.isArray(wallets)
  ) {
    wallets = [];
  }

  return wallets;
}

function saveWallets(wallets) {

  saveJSON(
    "wallets.json",
    wallets
  );
}

// ================= BROADCAST =================

function broadcast(text) {

  const users =
    loadJSON(
      "users.json"
    );

  users.forEach((id) => {

    bot.sendMessage(
      id,
      text,
      {
        parse_mode:
          "Markdown"
      }
    ).catch(() => {});

  });
}

// ================= DASHBOARD =================

function sendDashboard(chatId) {

  bot.sendMessage(
    chatId,
`📊 *USDT Tracker Dashboard*

Choose option 👇`,
    {
      parse_mode:
        "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                "📋 Wallets",
              callback_data:
                "wallets"
            },
            {
              text:
                "💰 Balances",
              callback_data:
                "balances"
            }
          ],
          [
            {
              text:
                "➕ Add Wallet",
              callback_data:
                "add"
            },
            {
              text:
                "➖ Remove Wallet",
              callback_data:
                "remove"
            }
          ]
        ]
      }
    }
  );
}

// ================= START =================

bot.onText(
  /\/start/,
  (msg) => {

    ensureUser(
      msg.chat.id
    );

    sendDashboard(
      msg.chat.id
    );
  }
);

// ================= CALLBACKS =================

bot.on(
  "callback_query",
  async (query) => {

    const chatId =
      query.message.chat.id;

    const data =
      query.data;

    bot.answerCallbackQuery(
      query.id
    );

    // ================= WALLET LIST =================

    if (
      data === "wallets"
    ) {

      const wallets =
        getWallets();

      if (
        wallets.length === 0
      ) {

        return bot.sendMessage(
          chatId,
          "❌ No wallets added"
        );
      }

      const text =
        wallets.map(
          (w, i) =>
`${i + 1}. ${w}`
        ).join("\n");

      bot.sendMessage(
        chatId,
        text
      );
    }

    // ================= BALANCES =================

    if (
      data === "balances"
    ) {

      const wallets =
        getWallets();

      if (
        wallets.length === 0
      ) {

        return bot.sendMessage(
          chatId,
          "❌ No wallets added"
        );
      }

      let text =
        "💰 *Wallet Balances*\n\n";

      const contract =
        new web3.eth.Contract(
          [
            {
              constant: true,
              inputs: [
                {
                  name:
                    "_owner",
                  type:
                    "address"
                }
              ],
              name:
                "balanceOf",
              outputs: [
                {
                  name:
                    "balance",
                  type:
                    "uint256"
                }
              ],
              type:
                "function"
            }
          ],
          USDT
        );

      for (const wallet of wallets) {

        try {

          const bnbRaw =
            await web3.eth.getBalance(
              wallet
            );

          const bnb =
            web3.utils.fromWei(
              bnbRaw,
              "ether"
            );

          const usdtRaw =
            await contract.methods
              .balanceOf(wallet)
              .call();

          const usdt =
            Number(usdtRaw) / 1e18;

          text +=
`📍 \`${wallet}\`

💵 USDT: ${usdt.toFixed(2)}
🟡 BNB: ${Number(bnb).toFixed(4)}

`;

        } catch {

          text +=
`❌ Error loading ${wallet}\n\n`;
        }
      }

      bot.sendMessage(
        chatId,
        text,
        {
          parse_mode:
            "Markdown"
        }
      );
    }

    // ================= ADD =================

    if (
      data === "add"
    ) {

      bot.sendMessage(
        chatId,
        "📥 Send wallet address"
      );

      const handler =
        (msg) => {

          if (
            msg.chat.id !==
            chatId
          ) return;

          bot.removeListener(
            "message",
            handler
          );

          const wallet =
            msg.text.toLowerCase();

          if (
            !wallet.startsWith(
              "0x"
            )
          ) {

            return bot.sendMessage(
              chatId,
              "❌ Invalid wallet"
            );
          }

          let wallets =
            getWallets();

          if (
            wallets.includes(
              wallet
            )
          ) {

            return bot.sendMessage(
              chatId,
              "⚠️ Wallet already exists"
            );
          }

          wallets.push(
            wallet
          );

          saveWallets(
            wallets
          );

          bot.sendMessage(
            chatId,
            "✅ Wallet Added"
          );
        };

      bot.on(
        "message",
        handler
      );
    }

    // ================= REMOVE =================

    if (
      data === "remove"
    ) {

      bot.sendMessage(
        chatId,
        "🗑 Send wallet address to remove"
      );

      const handler =
        (msg) => {

          if (
            msg.chat.id !==
            chatId
          ) return;

          bot.removeListener(
            "message",
            handler
          );

          const wallet =
            msg.text.toLowerCase();

          let wallets =
            getWallets();

          wallets =
            wallets.filter(
              (x) =>
                x !== wallet
            );

          saveWallets(
            wallets
          );

          bot.sendMessage(
            chatId,
            "✅ Wallet Removed"
          );
        };

      bot.on(
        "message",
        handler
      );
    }
  }
);

// ================= TRACKER =================

const lastBalances = {};

const contract =
  new web3.eth.Contract(
    [
      {
        constant: true,
        inputs: [
          {
            name:
              "_owner",
            type:
              "address"
          }
        ],
        name:
          "balanceOf",
        outputs: [
          {
            name:
              "balance",
            type:
              "uint256"
          }
        ],
        type:
          "function"
      }
    ],
    USDT
  );

async function checkTransfers() {

  const wallets =
    getWallets();

  if (
    wallets.length === 0
  ) {
    return;
  }

  for (const wallet of wallets) {

    try {

      const raw =
        await contract.methods
          .balanceOf(wallet)
          .call();

      const balance =
        Number(raw) / 1e18;

      // ===== FIRST LOAD =====

      if (
        lastBalances[wallet] ===
        undefined
      ) {

        lastBalances[wallet] =
          balance;

        continue;
      }

      const old =
        lastBalances[wallet];

      // ===== RECEIVED =====

      if (balance > old) {

        const diff =
          balance - old;

        console.log(
          "🚀 RECEIVED"
        );

        broadcast(
`🚀 *USDT RECEIVED*

📥 Wallet:
\`${wallet}\`

💰 Amount:
${diff.toFixed(2)} USDT

💵 New Balance:
${balance.toFixed(2)} USDT`
        );
      }

      // ===== SENT =====

      if (balance < old) {

        const diff =
          old - balance;

        console.log(
          "⚠️ SENT"
        );

        broadcast(
`⚠️ *USDT SENT*

📤 Wallet:
\`${wallet}\`

💸 Amount:
${diff.toFixed(2)} USDT

💵 New Balance:
${balance.toFixed(2)} USDT`
        );
      }

      lastBalances[wallet] =
        balance;

    } catch (err) {

      console.log(
        "TRACK ERROR:",
        err.message
      );
    }
  }
}

// ================= START TRACKER =================

console.log(
  "🚀 Transfer Tracker Started"
);

setInterval(
  checkTransfers,
  15000
);

checkTransfers();
