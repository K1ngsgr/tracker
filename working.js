require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { Web3 } = require("web3");
const WebSocket = require("ws");
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
  "0x55d398326f99059fF775485246999027B3197955".toLowerCase();

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

      let wallets =
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

      for (const wallet of wallets) {

        try {

          // ===== BNB =====

          const balance =
            await web3.eth.getBalance(
              wallet
            );

          const bnb =
            web3.utils.fromWei(
              balance,
              "ether"
            );

          // ===== USDT =====

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

          const usdt =
            await contract.methods
              .balanceOf(wallet)
              .call();

          const usdtBalance =
            Number(usdt) / 1e18;

          text +=
`📍 \`${wallet}\`

💵 USDT: ${usdtBalance.toFixed(2)}
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

// ================= WEBSOCKET =================

let ws;

function connectWS() {

  console.log(
    "🔌 Connecting WS..."
  );

  ws = new WebSocket(
    process.env.RPC
  );

  ws.on(
    "open",
    () => {

      console.log(
        "✅ Connected"
      );

      const topic =
        web3.utils.keccak256(
          "Transfer(address,address,uint256)"
        );

      ws.send(
        JSON.stringify({
          jsonrpc:
            "2.0",
          id: 1,
          method:
            "eth_subscribe",
          params: [
            "logs",
            {
              address:
                USDT,
              topics: [
                topic
              ]
            }
          ]
        })
      );
    }
  );

  ws.on(
    "message",
    async (data) => {

      try {

        const parsed =
          JSON.parse(data);

        if (
          !parsed.params
        ) return;

        const log =
          parsed.params.result;

        const wallets =
          getWallets();

        const from =
          web3.eth.abi.decodeParameter(
            "address",
            log.topics[1]
          ).toLowerCase();

        const to =
          web3.eth.abi.decodeParameter(
            "address",
            log.topics[2]
          ).toLowerCase();

        const amount =
          web3.utils.fromWei(
            log.data,
            "ether"
          );

        const tx =
`https://bscscan.com/tx/${log.transactionHash}`;

        // ================= RECEIVED =================

        if (
          wallets.includes(to)
        ) {

          console.log(
            "🚀 RECEIVED"
          );

          broadcast(
`🚀 *USDT RECEIVED*

💰 ${Number(amount).toFixed(2)} USDT

📥 \`${to}\`
📤 \`${from}\`

🔗 ${tx}`
          );
        }

        // ================= SENT =================

        if (
          wallets.includes(from)
        ) {

          console.log(
            "⚠️ SENT"
          );

          broadcast(
`⚠️ *USDT SENT*

💸 ${Number(amount).toFixed(2)} USDT

📤 \`${from}\`
📥 \`${to}\`

🔗 ${tx}`
          );
        }

      } catch (err) {

        console.log(
          "MESSAGE ERROR:",
          err.message
        );
      }
    }
  );

  ws.on(
    "error",
    (err) => {

      console.log(
        "❌ WS ERROR:",
        err.message
      );
    }
  );

  ws.on(
    "close",
    () => {

      console.log(
        "❌ WS Closed"
      );

      setTimeout(() => {

        connectWS();

      }, 3000);
    }
  );
}

connectWS();
