require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { Web3 } = require("web3");
const fs = require("fs");
const WebSocket = require("ws");

// ===== CONFIG =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// 🔥 TWO WEB3 CONNECTIONS
const web3 = new Web3(process.env.HTTP_RPC); // for balance
const WSS = process.env.RPC; // for realtime

const USDT = "0x55d398326f99059fF775485246999027B3197955".toLowerCase();

// ===== FILE =====
function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file)); } catch { return []; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===== USERS =====
function ensureUser(id) {
  let users = loadJSON("users.json");
  if (!users.includes(id)) {
    users.push(id);
    saveJSON("users.json", users);
  }
}

// ===== BROADCAST =====
function broadcast(msg) {
  const users = loadJSON("users.json");
  users.forEach(id => bot.sendMessage(id, msg, { parse_mode: "Markdown" }).catch(() => {}));
}

// ===== DASHBOARD =====
function dashboard(chatId) {
  bot.sendMessage(chatId,
`📊 *USDT Tracker Dashboard*
Choose action 👇`,
  {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📋 Wallets", callback_data: "wallets" },
          { text: "💰 Balance", callback_data: "balance_menu" }
        ],
        [
          { text: "➕ Add Wallet", callback_data: "add" },
          { text: "➖ Remove Wallet", callback_data: "remove" }
        ]
      ]
    }
  });
}

// ===== START =====
bot.onText(/\/start/, (msg) => {
  ensureUser(msg.chat.id);
  dashboard(msg.chat.id);
});

// ===== BUTTON HANDLER =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;
  bot.answerCallbackQuery(q.id);

  // 📋 WALLET LIST
  if (data === "wallets") {
    const wallets = loadJSON("wallets.json");

    if (!wallets.length) return bot.sendMessage(chatId, "❌ No wallets");

    const buttons = wallets.map(w => [
      { text: w.slice(0, 8) + "...", callback_data: "copy_" + w }
    ]);

    bot.sendMessage(chatId, "📋 Click to copy:", {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // COPY WALLET
  if (data.startsWith("copy_")) {
    const wallet = data.replace("copy_", "");
    bot.sendMessage(chatId, `📋 \`${wallet}\``, { parse_mode: "Markdown" });
  }

  // ADD WALLET
  if (data === "add") {
    bot.sendMessage(chatId, "📥 Send wallet address:");

    const handler = (msg) => {
      if (msg.chat.id !== chatId) return;

      const w = msg.text.toLowerCase();
      bot.removeListener("message", handler);

      if (!w.startsWith("0x")) {
        return bot.sendMessage(chatId, "❌ Invalid address");
      }

      let wallets = loadJSON("wallets.json");
      wallets.push(w);
      saveJSON("wallets.json", wallets);

      bot.sendMessage(chatId, "✅ Added");
      dashboard(chatId);
    };

    bot.on("message", handler);
  }

  // REMOVE WALLET
  if (data === "remove") {
    let wallets = loadJSON("wallets.json");

    if (!wallets.length) return bot.sendMessage(chatId, "❌ No wallets");

    const buttons = wallets.map(w => [
      { text: w.slice(0, 8) + "...", callback_data: "del_" + w }
    ]);

    bot.sendMessage(chatId, "Select wallet:", {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  if (data.startsWith("del_")) {
    let wallets = loadJSON("wallets.json");
    const w = data.replace("del_", "");

    wallets = wallets.filter(x => x !== w);
    saveJSON("wallets.json", wallets);

    bot.sendMessage(chatId, "🗑 Removed");
    dashboard(chatId);
  }

  // 💰 BALANCE MENU
  if (data === "balance_menu") {
    const wallets = loadJSON("wallets.json");

    if (!wallets.length) return bot.sendMessage(chatId, "❌ No wallets");

    const buttons = wallets.map(w => [
      { text: "💰 " + w.slice(0, 6) + "...", callback_data: "bal_" + w }
    ]);

    bot.sendMessage(chatId, "Select wallet:", {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // 💰 GET BALANCE
  if (data.startsWith("bal_")) {
    const wallet = data.replace("bal_", "");

    try {
      const contract = new web3.eth.Contract([
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
          type: "function"
        }
      ], USDT);

      const bal = await contract.methods.balanceOf(wallet).call();
      const readable = (Number(bal) / 1e18).toFixed(4);

      bot.sendMessage(chatId,
`💰 *Wallet Balance*

📍 \`${wallet}\`
🪙 ${readable} USDT`,
        { parse_mode: "Markdown" }
      );

    } catch (err) {
      bot.sendMessage(chatId, "❌ RPC error");
    }
  }
});

// ===== REALTIME TRACKER =====
function startWS() {
  console.log("🔌 Connecting WS...");
  const ws = new WebSocket(WSS);

  ws.on("open", () => {
    console.log("✅ Connected");

    const topic = web3.utils.keccak256("Transfer(address,address,uint256)");

    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_subscribe",
      params: ["logs", { address: USDT, topics: [topic] }]
    }));
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (!msg.params) return;

      const log = msg.params.result;
      const wallets = loadJSON("wallets.json");

      const from = "0x" + log.topics[1].slice(26).toLowerCase();
      const to = "0x" + log.topics[2].slice(26).toLowerCase();
      const value = web3.utils.fromWei(
        web3.utils.hexToNumberString(log.data),
        "ether"
      );

      if (wallets.includes(to)) {
        broadcast(
`🚀 *USDT RECEIVED*

💰 ${value} USDT
📥 \`${to}\`
📤 \`${from}\``
        );
      }

      if (wallets.includes(from)) {
        broadcast(
`⚠️ *USDT SENT*

💸 ${value} USDT
📤 \`${from}\`
📥 \`${to}\``
        );
      }

    } catch {}
  });

  ws.on("close", () => setTimeout(startWS, 5000));
  ws.on("error", () => ws.close());
}

startWS();
