const axios = require("axios");

class DiscordWebhookService {
    constructor() {
        this.apiBase = "https://discord.com/api/v10";
    }

    async sendEmbedMessage(webhookUrl, embed, buttonUrl = null, buttonLabel = null) {
        try {
            const payload = {
                embeds: [embed]
            };

            if (buttonUrl && buttonLabel) {
                payload.components = [{
                    type: 1,
                    components: [{
                        type: 2,
                        style: 5,
                        label: buttonLabel,
                        url: buttonUrl
                    }]
                }];
            }

            const response = await axios.post(webhookUrl, payload, {
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (response.status !== 204) { // Discord webhook returns 204 No Content on success
                throw new Error(`메시지 전송 실패: ${response.statusText}`);
            }

            return { success: true };
        } catch (error) {
            console.error("메시지 전송 오류:", error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = new DiscordWebhookService();
