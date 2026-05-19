require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { Web3 } = require("web3");
const fs = require("fs");
const WebSocket = require("ws");

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

bot.on("polling_error", (err) => {
  console.log(
    "❌ POLLING ERROR:",
    err.message
  );
});

bot.getMe()
  .then((me) => {
    console.log(
      "✅ Telegram Connected:",
      me.username
    );
  })
  .catch((err) => {
    console.log(
      "❌ TELEGRAM ERROR:",
      err.message
    );
  });

bot.deleteWebHook();

// ================= WEB3 =================

const web3 = new Web3(
  process.env.HTTP_RPC
);

const WSS = process.env.RPC;

const USDT =
  "0x55d398326f99059fF775485246999027B3197955".toLowerCase();

// ================= FILES =================

if (!fs.existsSync("wallets.json")) {
  fs.writeFileSync(
    "wallets.json",
    "[]"
  );
}

if (!fs.existsSync("users.json")) {
  fs.writeFileSync(
    "users.json",
    "[]"
  );
}

function loadJSON(file) {

  try {

    return JSON.parse(
      fs.readFileSync(file)
    );

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
    loadJSON("users.json");

  if (!users.includes(id)) {

    users.push(id);

    saveJSON(
      "users.json",
      users
    );
  }
}

// ================= BROADCAST =================

function broadcast(msg) {

  const users =
    loadJSON("users.json");

  users.forEach((id) => {

    bot.sendMessage(id, msg, {
      parse_mode: "Markdown"
    }).catch((err) => {

      console.log(
        "SEND ERROR:",
        err.message
      );

    });

  });
}

// ================= DASHBOARD =================

function dashboard(chatId) {

  bot.sendMessage(
    chatId,
`📊 *USDT Tracker Dashboard*

Choose action 👇`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📋 Wallets",
              callback_data: "wallets"
            },
            {
              text: "➕ Add Wallet",
              callback_data: "add"
            }
          ],
          [
            {
              text: "➖ Remove Wallet",
              callback_data: "remove"
            }
          ]
        ]
      }
    }
  );
}

// ================= START =================

bot.onText(/\/start/, (msg) => {

  ensureUser(msg.chat.id);

  dashboard(msg.chat.id);

});

// ================= BUTTONS =================

bot.on(
  "callback_query",
  async (q) => {

    const chatId =
      q.message.chat.id;

    const data = q.data;

    bot.answerCallbackQuery(
      q.id
    );

    // ===== WALLET LIST =====

    if (data === "wallets") {

      const wallets =
        loadJSON(
          "wallets.json"
        );

      if (!wallets.length) {

        return bot.sendMessage(
          chatId,
          "❌ No wallets"
        );
      }

      bot.sendMessage(
        chatId,
        wallets.join("\n")
      );
    }

    // ===== ADD =====

    if (data === "add") {

      bot.sendMessage(
        chatId,
        "📥 Send wallet address:"
      );

      const handler = (
        msg
      ) => {

        if (
          msg.chat.id !==
          chatId
        )
          return;

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
          loadJSON(
            "wallets.json"
          );

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

        wallets.push(wallet);

        saveJSON(
          "wallets.json",
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

    // ===== REMOVE =====

    if (
      data === "remove"
    ) {

      bot.sendMessage(
        chatId,
        "🗑 Send wallet to remove:"
      );

      const handler = (
        msg
      ) => {

        if (
          msg.chat.id !==
          chatId
        )
          return;

        bot.removeListener(
          "message",
          handler
        );

        const wallet =
          msg.text.toLowerCase();

        let wallets =
          loadJSON(
            "wallets.json"
          );

        wallets =
          wallets.filter(
            (x) =>
              x !== wallet
          );

        saveJSON(
          "wallets.json",
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

function startWS() {

  console.log(
    "🔌 Connecting WS..."
  );

  ws = new WebSocket(WSS);

  ws.on("open", () => {

    console.log(
      "✅ Connected"
    );

    const topic =
      web3.utils.keccak256(
        "Transfer(address,address,uint256)"
      );

    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
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
  });

  ws.on(
    "message",
    async (data) => {

      try {

        const msg =
          JSON.parse(data);

        if (
          !msg.params?.result
        )
          return;

        const log =
          msg.params.result;

        const wallets =
          loadJSON(
            "wallets.json"
          );

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

        const value =
          web3.utils.fromWei(
            log.data,
            "ether"
          );

        const tx =
`https://bscscan.com/tx/${log.transactionHash}`;

        if (
          wallets.includes(to)
        ) {

          console.log(
            "🚀 RECEIVED"
          );

          broadcast(
`🚀 *USDT RECEIVED*

💰 ${Number(value).toFixed(2)} USDT

📥 \`${to}\`
📤 \`${from}\`

🔗 ${tx}`
          );
        }

        if (
          wallets.includes(from)
        ) {

          console.log(
            "⚠️ SENT"
          );

          broadcast(
`⚠️ *USDT SENT*

💸 ${Number(value).toFixed(2)} USDT

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
    "close",
    () => {

      console.log(
        "❌ WS Closed"
      );

      setTimeout(() => {

        startWS();

      }, 3000);
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
}

startWS();
