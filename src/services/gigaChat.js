require('dotenv').config();
const { GigaChat } = require('gigachat-node');

const giga = new GigaChat({
  credentials: process.env.giga_key,
  model: "GigaChat-2",
  timeout: 30,
  verify_ssl_certs: false
});

async function chatWithGiga(message) {
  try {
    const response = await giga.chat(message); // chat вместо invoke/sendMessage
    if (response?.choices?.length > 0) {
      return response.choices[0].message.content || '';
    }
    return '';
  } catch (err) {
    console.error('GigaChat error:', err);
    return null;
  }
}

module.exports = { chatWithGiga };
