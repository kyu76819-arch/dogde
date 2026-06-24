const axios = require("axios");

class DiscordDMService {
    constructor(client, db) {
        this.client = client;
        this.db = db; // Firebase DB 인스턴스
        this.COLORS = {
            TICKET_NEW: 0x5865F2,
            TICKET_CHAT: 0x3B82F6,
            TICKET_INQUIRY: 0xF59E0B,
            CHAT_ADMIN: 0xF97316,
            CHAT_USER: 0x3B82F6,
            TICKET_CLOSED: 0x10B981,
            DANGER: 0xEF4444
        };
        this.apiBase = 'https://discord.com/api/v10';
    }

    async createDMChannel(userId) {
        try {
            const user = await this.client.users.fetch(userId);
            const dmChannel = await user.createDM();
            return dmChannel;
        } catch (e) {
            console.error('DM 채널 생성 오류:', e);
            return null;
        }
    }

    async sendDM(userId, payload) {
        const dmChannel = await this.createDMChannel(userId);
        if (!dmChannel) return null;

        try {
            const message = await dmChannel.send(payload);
            return message;
        } catch (e) {
            console.error('DM 전송 오류:', e);
            return null;
        }
    }

    async deleteDM(userId, messageId) {
        const dmChannel = await this.createDMChannel(userId);
        if (!dmChannel) return;

        try {
            const message = await dmChannel.messages.fetch(messageId);
            if (message) {
                await message.delete();
            }
        } catch (e) {
            console.error('DM 삭제 오류:', e);
        }
    }

    // Firebase를 통해 DM 메시지 ID 추적 (영구 저장)
    async trackMessage(ticketId, userId, messageId) {
        const ref = this.db.ref(`sentMessages/${ticketId}/${userId}`);
        const snapshot = await ref.once('value');
        const messages = snapshot.val() || [];
        messages.push(messageId);
        await ref.set(messages);
    }

    async deleteAllTicketMessages(ticketId) {
        const ref = this.db.ref(`sentMessages/${ticketId}`);
        const snapshot = await ref.once('value');
        const ticketMessages = snapshot.val();

        if (!ticketMessages) return;

        for (const userId of Object.keys(ticketMessages)) {
            const messageIds = ticketMessages[userId];
            for (const msgId of messageIds) {
                await this.deleteDM(userId, msgId);
                await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit 방지
            }
        }
        await ref.remove(); // Firebase에서 추적 데이터 삭제
    }

    // --- 도우미 함수 (Firebase 또는 환경 변수에서 데이터 로드) ---
    async getSiteInfo(siteId) {
        const snapshot = await this.db.ref(`sites/${siteId}`).once('value');
        const site = snapshot.val();
        return {
            name: (site && site.siteName) || '티켓 시스템',
            description: (site && site.siteDescription) || ''
        };
    }

    getTicketUrl(ticketId, siteId) {
        // 실제 웹 애플리케이션의 티켓 URL 구조에 맞게 수정해야 합니다.
        // 예: `https://your-webapp.com/ticket.html?site=${siteId}&ticket=${ticketId}`
        return `https://your-webapp.com/ticket.html?site=${siteId}&ticket=${ticketId}`;
    }

    async getLinkedAdmins(siteId) {
        const snapshot = await this.db.ref(`users`).once('value');
        const allUsers = snapshot.val() || {};
        return Object.values(allUsers).filter(u => u.isAdmin && u.discordId && u.siteId === siteId);
    }

    async getTicketCategories(siteId) {
        const snapshot = await this.db.ref(`ticketCategories/${siteId}`).once('value');
        return snapshot.val() || [];
    }

    async getSiteSettings(siteId) {
        const snapshot = await this.db.ref(`siteSettings/${siteId}`).once('value');
        return snapshot.val() || {};
    }

    // --- 티켓 이벤트 핸들러 (웹 앱에서 호출되거나 디스코드 상호작용으로 트리거) ---

    async onTicketCreated(ticket, ticketMode, creatorDiscordId, siteId) {
        const siteInfo = await this.getSiteInfo(siteId);
        const ticketUrl = this.getTicketUrl(ticket.id, siteId);
        const ticketCategories = await this.getTicketCategories(siteId);

        const priorityLabels = { 'low': '낮음', 'medium': '보통', 'high': '높음', 'urgent': '긴급' };
        const priorityColors = { 'low': '🟢', 'medium': '🟡', 'high': '🟠', 'urgent': '🔴' };
        const modeLabel = ticketMode === 'chat' ? '💬 대화형' : '📋 문의형';
        const embedColor = ticketMode === 'chat' ? this.COLORS.TICKET_CHAT : this.COLORS.TICKET_INQUIRY;

        const categoryLabel = ticketCategories.find(c => c.id === ticket.category)?.name || ticket.category;
        const priorityLabelText = priorityLabels[ticket.priority] || ticket.priority;

        const embed = {
            author: {
                name: siteInfo.name,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            title: `🎫 새 티켓: ${ticket.title}`,
            url: ticketUrl,
            description: siteInfo.description
                ? `> ${siteInfo.description}\n\n${ticket.content.length > 300 ? ticket.content.substring(0, 297) + '...' : ticket.content}`
                : (ticket.content.length > 400 ? ticket.content.substring(0, 397) + '...' : ticket.content),
            color: embedColor,
            fields: [
                { name: '📌 ID', value: `\`${ticket.id}\``, inline: true },
                { name: '📂 카테고리', value: categoryLabel, inline: true },
                { name: `${priorityColors[ticket.priority] || '⚪'} 우선순위`, value: priorityLabelText, inline: true },
                { name: '📋 유형', value: modeLabel, inline: true },
                { name: '👤 작성자', value: creatorDiscordId ? `<@${creatorDiscordId}>` : `\`${ticket.creatorName}\``, inline: true },
                { name: '👔 담당자', value: ticket.assignee || '미지정', inline: true }
            ],
            footer: {
                text: `${siteInfo.name} • ${ticket.id}`,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            timestamp: new Date().toISOString()
        };

        const linkEmbed = {
            color: 0x2F3136,
            description: `[**🔗 웹사이트에서 보기**](${ticketUrl})\n> 연동된 계정 또는 관리자만 접근 가능`
        };

        const components = [{
            type: 1,
            components: [{
                type: 2,
                style: 4,
                label: '티켓 닫기',
                custom_id: `close_ticket_${ticket.id}`,
                emoji: { name: '🔒' }
            }]
        }];

        const payload = {
            embeds: [embed, linkEmbed],
            components: components
        };

        const admins = await this.getLinkedAdmins(siteId);
        for (const admin of admins) {
            const msg = await this.sendDM(admin.discordId, payload);
            if (msg) {
                await this.trackMessage(ticket.id, admin.discordId, msg.id);
            }
        }

        if (creatorDiscordId) {
            const creatorEmbed = {
                author: {
                    name: siteInfo.name,
                    icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
                },
                title: `✅ 티켓이 접수되었습니다`,
                description: [
                    `**${ticket.title}**`,
                    '',
                    ticketMode === 'chat'
                        ? '> 대화형 티켓입니다. 관리자와 실시간으로 대화할 수 있습니다.'
                        : '> 문의형 티켓입니다. 관리자가 답변을 완료하면 알림을 받습니다.',
                    '',
                    `[웹사이트에서 확인](${ticketUrl})`
                ].join('\n'),
                color: embedColor,
                fields: [
                    { name: '📌 ID', value: `\`${ticket.id}\``, inline: true },
                    { name: '📋 유형', value: modeLabel, inline: true },
                    { name: '📊 상태', value: '⏳ 대기 중', inline: true }
                ],
                footer: {
                    text: `${siteInfo.name} • 티켓 접수 완료`,
                    icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
                },
                timestamp: new Date().toISOString()
            };

            const creatorPayload = {
                embeds: [creatorEmbed],
                components: components
            };

            const msg = await this.sendDM(creatorDiscordId, creatorPayload);
            if (msg) {
                await this.trackMessage(ticket.id, creatorDiscordId, msg.id);
            }
        }
    }

    async sendChatDM(ticketId, ticket, authorName, content, isAdminSender, authorDiscordId, siteId) {
        const siteInfo = await this.getSiteInfo(siteId);
        const ticketUrl = this.getTicketUrl(ticketId, siteId);
        const siteSettings = await this.getSiteSettings(siteId);
        const ticketCategories = await this.getTicketCategories(siteId);

        const cat = ticketCategories.find(c => c.id === ticket.category);
        const ticketMode = (cat && cat.ticketMode) ? cat.ticketMode : siteSettings.ticketMode || 'chat';

        if (ticketMode === 'inquiry') return; // 문의형은 DM으로 대화 전달 안함

        const color = isAdminSender ? this.COLORS.CHAT_ADMIN : this.COLORS.CHAT_USER;
        const roleLabel = isAdminSender ? '👑 관리자' : '💬 작성자';

        const embed = {
            author: {
                name: `${authorName} (${roleLabel})`,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            description: content,
            color: color,
            footer: {
                text: `${siteInfo.name} • ${ticketId} • ${ticket.title}`,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            timestamp: new Date().toISOString()
        };

        const payload = {
            embeds: [embed]
        };

        if (isAdminSender) {
            const creator = await this.db.ref(`users/${ticket.creatorId}`).once('value');
            const creatorData = creator.val();
            if (creatorData && creatorData.discordId) {
                const msg = await this.sendDM(creatorData.discordId, payload);
                if (msg) {
                    await this.trackMessage(ticketId, creatorData.discordId, msg.id);
                }
            }
        } else {
            const admins = await this.getLinkedAdmins(siteId);
            for (const admin of admins) {
                const msg = await this.sendDM(admin.discordId, payload);
                if (msg) {
                    await this.trackMessage(ticketId, admin.discordId, msg.id);
                }
            }
        }
    }

    async onTicketStatusChanged(ticketId, newStatus, ticket, siteId) {
        const siteInfo = await this.getSiteInfo(siteId);
        const ticketUrl = this.getTicketUrl(ticketId, siteId);

        const statusLabels = {
            'open': '🟢 열림',
            'pending': '🟡 대기 중',
            'closed': '🔴 닫힘'
        };
        const statusColor = {
            'open': this.COLORS.TICKET_NEW,
            'pending': this.COLORS.TICKET_INQUIRY,
            'closed': this.COLORS.TICKET_CLOSED
        };

        const embed = {
            author: {
                name: siteInfo.name,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            title: `🔔 티켓 상태 변경: ${ticket.title}`,
            description: `**${ticket.title}** 티켓의 상태가 **${statusLabels[newStatus] || newStatus}**으로 변경되었습니다.`,
            url: ticketUrl,
            color: statusColor[newStatus] || this.COLORS.TICKET_NEW,
            fields: [
                { name: '📌 ID', value: `\`${ticketId}\``, inline: true },
                { name: '📊 새 상태', value: statusLabels[newStatus] || newStatus, inline: true }
            ],
            footer: {
                text: `${siteInfo.name} • 상태 변경 알림`,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            timestamp: new Date().toISOString()
        };

        const payload = { embeds: [embed] };

        const admins = await this.getLinkedAdmins(siteId);
        for (const admin of admins) {
            const msg = await this.sendDM(admin.discordId, payload);
            if (msg) this.trackMessage(ticketId, admin.discordId, msg.id);
        }

        if (ticket) {
            const creator = await this.db.ref(`users/${ticket.creatorId}`).once('value');
            const creatorData = creator.val();
            if (creatorData && creatorData.discordId) {
                const msg = await this.sendDM(creatorData.discordId, payload);
                if (msg) this.trackMessage(ticketId, creatorData.discordId, msg.id);
            }
        }

        if (newStatus === 'closed') {
            await this.deleteAllTicketMessages(ticketId);
        }
    }

    async onTicketDeleted(ticketId, ticketTitle, siteId) {
        const siteInfo = await this.getSiteInfo(siteId);

        const embed = {
            title: `🗑️ 티켓 삭제됨`,
            description: `**${ticketTitle || '제목 없음'}** (\`${ticketId}\`) 티켓이 삭제되었습니다.\n\n> 관련 대화 내용이 모두 삭제됩니다.`,
            color: this.COLORS.DANGER,
            footer: {
                text: `${siteInfo.name} • 티켓 소멸`,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            timestamp: new Date().toISOString()
        };

        const admins = await this.getLinkedAdmins(siteId);
        for (const admin of admins) {
            await this.sendDM(admin.discordId, { embeds: [embed] });
        }
        await this.deleteAllTicketMessages(ticketId);
    }

    async onInquiryAnswered(ticketId, ticket, siteId) {
        const siteInfo = await this.getSiteInfo(siteId);
        const ticketUrl = this.getTicketUrl(ticketId, siteId);

        const creator = await this.db.ref(`users/${ticket.creatorId}`).once('value');
        const creatorData = creator.val();
        if (!creatorData || !creatorData.discordId) return;

        const embed = {
            author: {
                name: siteInfo.name,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            title: `📬 답변이 완료되었습니다`,
            description: [
                `**${ticket.title}**`,
                '',
                '> 관리자가 문의에 답변했습니다. 웹사이트에서 확인해주세요.',
                '',
                `[**웹사이트에서 답변 확인하기**](${ticketUrl})`
            ].join('\n'),
            color: this.COLORS.TICKET_CLOSED,
            fields: [
                { name: '📌 ID', value: `\`${ticketId}\``, inline: true },
                { name: '📊 상태', value: '✅ 답변 완료', inline: true }
            ],
            footer: {
                text: `${siteInfo.name} • 답변 완료 알림`,
                icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            timestamp: new Date().toISOString()
        };

        const components = [{
            type: 1,
            components: [{
                type: 2,
                style: 4,
                label: '티켓 닫기',
                custom_id: `close_ticket_${ticketId}`,
                emoji: { name: '🔒' }
            }]
        }];

        const msg = await this.sendDM(creatorData.discordId, { embeds: [embed], components: components });
        if (msg) await this.trackMessage(ticketId, creatorData.discordId, msg.id);
    }
}

module.exports = DiscordDMService;
