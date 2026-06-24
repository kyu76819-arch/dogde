require("dotenv").config();
const { Client, GatewayIntentBits, InteractionType } = require("discord.js");
const admin = require("firebase-admin");
const express = require("express");
const DiscordDMService = require("./discordDMService");

// Firebase Admin SDK 초기화
const firebaseServiceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!firebaseServiceAccountKey) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY 환경 변수가 설정되지 않았습니다.");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(firebaseServiceAccountKey);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log("Firebase Admin SDK 초기화 완료");
} catch (error) {
    console.error("Firebase 서비스 계정 키 파싱 오류:", error);
    process.exit(1);
}

const db = admin.database();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // For fetching user info if needed
        GatewayIntentBits.MessageContent, // Required for message.content
    ]
});

const discordDMService = new DiscordDMService(client, db);

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    if (message.content === "!ping") {
        message.reply("Pong!");
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [action, ticketId] = interaction.customId.split("_");

    if (action === "close" && ticketId) {
        await interaction.deferReply({ ephemeral: true });
        try {
            // 티켓 정보를 Firebase에서 가져와야 합니다.
            const ticketRef = db.ref(`tickets/${ticketId}`);
            const ticketSnapshot = await ticketRef.once("value");
            const ticket = ticketSnapshot.val();

            if (!ticket) {
                await interaction.editReply("해당 티켓을 찾을 수 없습니다.");
                return;
            }

            // 상호작용을 한 사용자가 티켓 작성자이거나 관리자인지 확인
            const userRef = db.ref(`users/${interaction.user.id}`);
            const userSnapshot = await userRef.once("value");
            const userData = userSnapshot.val();

            const isAdmin = userData && userData.isAdmin;
            const isCreator = ticket.creatorId === interaction.user.id;

            if (!isAdmin && !isCreator) {
                await interaction.editReply("이 티켓을 닫을 권한이 없습니다.");
                return;
            }

            // 티켓 상태를 'closed'로 변경
            await ticketRef.update({ status: "closed" });
            await discordDMService.onTicketStatusChanged(ticketId, "closed", ticket, ticket.siteId); // siteId는 티켓 객체에 포함되어야 함

            await interaction.editReply(`티켓 **${ticketId}**가 성공적으로 닫혔습니다.`);
        } catch (error) {
            console.error("티켓 닫기 처리 중 오류 발생:", error);
            await interaction.editReply("티켓을 닫는 중 오류가 발생했습니다.");
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);

// Express 서버 설정 (웹 애플리케이션에서 이벤트를 수신하기 위함)
const app = express();
app.use(express.json());

app.post("/webhook/ticket", async (req, res) => {
    const { eventType, ticket, ticketMode, creatorDiscordId, siteId, authorName, content, isAdminSender, newStatus, ticketTitle } = req.body;

    try {
        switch (eventType) {
            case "ticketCreated":
                await discordDMService.onTicketCreated(ticket, ticketMode, creatorDiscordId, siteId);
                break;
            case "chatMessage":
                await discordDMService.sendChatDM(ticket.id, ticket, authorName, content, isAdminSender, creatorDiscordId, siteId);
                break;
            case "ticketStatusChanged":
                await discordDMService.onTicketStatusChanged(ticket.id, newStatus, ticket, siteId);
                break;
            case "ticketDeleted":
                await discordDMService.onTicketDeleted(ticket.id, ticketTitle, siteId);
                break;
            case "inquiryAnswered":
                await discordDMService.onInquiryAnswered(ticket.id, ticket, siteId);
                break;
            default:
                console.warn("알 수 없는 이벤트 타입:", eventType);
        }
        res.status(200).send("Event processed");
    } catch (error) {
        console.error("Webhook 처리 중 오류 발생:", error);
        res.status(500).send("Error processing event");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
});
