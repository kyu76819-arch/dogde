require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Discord 봇 클라이언트 설정
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // check-membership을 위해 필요
    ],
    partials: [Partials.Channel, Partials.Message],
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 봇 준비 완료 시
client.once('ready', () => {
    console.log(`Discord 봇 로그인 완료! ${client.user.tag}으로 로그인됨.`);
});

// Discord API 토큰으로 로그인
client.login(process.env.DISCORD_BOT_TOKEN);

// ============================================================
// API 엔드포인트
// ============================================================

// 봇 서버 멤버십 확인 엔드포인트
app.get('/api/check-membership', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'userId가 필요합니다.' });
    }

    try {
        // 봇이 참여하고 있는 모든 서버를 순회하며 멤버십 확인
        let isMember = false;
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.fetch(userId);
                isMember = true;
                break; // 멤버를 찾았으면 더 이상 검색할 필요 없음
            } catch (error) {
                // 해당 서버에 유저가 없거나 접근 권한이 없는 경우
                continue;
            }
        }

        if (isMember) {
            res.json({ success: true, message: '사용자가 봇이 있는 서버에 속해 있습니다.' });
        } else {
            res.json({ success: false, message: '사용자가 봇이 있는 서버에 속해 있지 않습니다.' });
        }
    } catch (error) {
        console.error('멤버십 확인 중 오류 발생:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});

// 디스코드 알림 전송 엔드포인트
app.post('/api/discord/notify', async (req, res) => {
    const { ticket, userId } = req.body;

    if (!ticket || !userId) {
        return res.status(400).json({ success: false, message: 'ticket 및 userId가 필요합니다.' });
    }

    try {
        const user = await client.users.fetch(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: '해당 Discord 사용자를 찾을 수 없습니다.' });
        }

        const ticketUrl = `http://https://ticketbotdiscord.netlify.app/ticket.html?site=${ticket.siteId || 'default'}&ticket=${ticket.id}`;
        // 실제 배포 시에는 `BOT_SERVER_URL` 대신 실제 프론트엔드 URL을 사용해야 합니다.

        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Discord Blurple
            .setTitle(`🎫 새 티켓: ${ticket.title}`)
            .setDescription(ticket.content.length > 400 ? ticket.content.substring(0, 397) + '...' : ticket.content)
            .addFields(
                { name: '📌 ID', value: `\`${ticket.id}\``, inline: true },
                { name: '📂 카테고리', value: ticket.category || '미지정', inline: true },
                { name: '📊 우선순위', value: ticket.priority || '미지정', inline: true },
                { name: '👤 작성자', value: ticket.creatorName || '알 수 없음', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `티켓 시스템 • ${ticket.id}` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('웹사이트에서 보기')
                    .setStyle(ButtonStyle.Link)
                    .setURL(ticketUrl),
            );

        await user.send({ embeds: [embed], components: [row] });
        console.log(`Discord 사용자 ${user.tag}에게 티켓 알림 전송 완료: ${ticket.id}`);
        res.json({ success: true, message: '알림이 성공적으로 전송되었습니다.' });

    } catch (error) {
        console.error('Discord 알림 전송 중 오류 발생:', error);
        res.status(500).json({ success: false, message: '알림 전송에 실패했습니다.' });
    }
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`Express 서버가 ${PORT} 포트에서 실행 중입니다.`);
});

// 에러 핸들링
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
