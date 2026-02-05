// hf_llm.js
const fetch = require('node-fetch');
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || 'Qwen/Qwen2.5-VL-7B-Instruct';

if (!HF_API_KEY) {
  throw new Error('HF_TOKEN не установлен. Добавьте его в .env');
}

async function invoke(prompt) {
  const systemPrompt = 'Ты — строгий ассистент. Отвечай ТОЛЬКО в требуемом формате. Никаких пояснений.';
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      'Content-Type': 'application/json',
      'HF-Model': HF_MODEL
    },
    body: JSON.stringify({
      model: HF_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5, // важно для структурированного JSON
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HF error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('HF вернул пустой ответ');

  return { content };
}

module.exports = { invoke };