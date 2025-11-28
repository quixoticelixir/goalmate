const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const USE_OPENAI = process.env.USE_OPENAI === 'true';

const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || 'Qwen/Qwen2.5-VL-7B-Instruct';
const USE_HF = process.env.USE_HF === 'true';

function fakeHeuristicBreakdown(goal) {
  const lower = goal.toLowerCase();
  const subgoals = [];

  const parts = goal.split(/,|;| and |\u0438\s+|&/i).map(p => p.trim()).filter(Boolean);

  if (lower.includes('learn') || lower.includes('study') || lower.includes('изуч') || lower.includes('выуч')) {
    subgoals.push('Clarify what “learned” means for this topic.');
    subgoals.push('Collect a short, focused list of learning resources.');
    subgoals.push('Create a weekly study schedule with realistic time blocks.');
    subgoals.push('Complete at least one small project using the new knowledge.');
  }

  if (lower.includes('build') || lower.includes('create') || lower.includes('make') || lower.includes('создать') || lower.includes('сделать')) {
    subgoals.push('Write down the main requirements and constraints for the project.');
    subgoals.push('Break the solution into 3–7 concrete deliverables (start with an MVP).');
    subgoals.push('Sketch a simple outline or wireframe for the solution.');
    subgoals.push('Implement deliverables one by one, verifying each on completion.');
  }

  if (lower.includes('job') || lower.includes('career') || lower.includes('работ') || lower.includes('карьер')) {
    subgoals.push('Define the target role and industry as specifically as possible.');
    subgoals.push('Update CV/portfolio to reflect that target role.');
    subgoals.push('Schedule weekly blocks for applications and networking.');
    subgoals.push('Gather feedback on applications and iterate.');
  }

  parts.forEach((part, index) => {
    subgoals.push(`Refine sub-goal #${index + 1}: ${part}`);
  });

  if (subgoals.length === 0) {
    subgoals.push('Clarify what success looks like for this goal.');
    subgoals.push('List key constraints (time, skills, money, tools).');
    subgoals.push('Split the path into 3–5 milestones with approximate deadlines.');
    subgoals.push('Define the very first small step you can take today.');
  }

  return {
    subgoals: subgoals.slice(0, 8),
    meta: {
      model: 'local-heuristic-v0',
      source: 'heuristic',
      note: 'Replace fakeHeuristicBreakdown() with a real neural model call (e.g., OpenAI API, local model).'
    }
  };
}

async function callHuggingFaceModel(goal) {
  if (!HF_API_KEY) {
    throw new Error('HF_API_KEY is not set. Add it to your environment or .env file.');
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node 18+ or add a fetch polyfill.');
  }

  const systemPrompt =
    'You are an assistant that decomposes a single user goal into 3–8 concise, actionable sub-goals. ' +
    'Return ONLY valid JSON of the form {"subgoals": ["...", "..."]} with no additional text. ' +
    'Sub-goals should be concrete steps that move the user toward the goal.';

  const userPrompt =
    `Decompose this goal into sub-goals:\n\n` +
    `Goal: "${goal}"\n\n` +
    `Remember: respond with JSON only.`;

  console.log('Calling Hugging Face model:', HF_MODEL);

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
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Hugging Face API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  const contentCandidate = data.choices?.[0]?.message?.content ?? '';

  let parsed;
  try {
    parsed = JSON.parse(contentCandidate);
  } catch (error) {
    throw new Error('Failed to parse Hugging Face model response as JSON: ' + error.message);
  }

  if (!parsed || !Array.isArray(parsed.subgoals)) {
    throw new Error('Hugging Face model response JSON does not contain a "subgoals" array.');
  }

  const cleaned = parsed.subgoals
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  if (cleaned.length === 0) {
    throw new Error('Hugging Face model returned an empty list of subgoals.');
  }

  return {
    subgoals: cleaned,
    meta: {
      model: HF_MODEL,
      source: 'huggingface',
      provider: 'huggingface',
      note: 'Generated via Hugging Face Inference API.'
    }
  };
}

async function callOpenAIModel(goal) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your environment or .env file.');
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node 18+ or add a fetch polyfill.');
  }

  const systemPrompt =
    'You are an assistant that decomposes a single user goal into 3–8 concise, actionable sub-goals. ' +
    'Return ONLY valid JSON of the form {"subgoals": ["...", "..."]} with no additional text. ' +
    'Sub-goals should be concrete steps that move the user toward the goal.';

  const userPrompt =
    `Decompose this goal into sub-goals:\n\n` +
    `Goal: "${goal}"\n\n` +
    `Remember: respond with JSON only.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '';

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error('Failed to parse model response as JSON: ' + error.message);
  }

  if (!parsed || !Array.isArray(parsed.subgoals)) {
    throw new Error('Model response JSON does not contain a "subgoals" array.');
  }

  const cleaned = parsed.subgoals
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  if (cleaned.length === 0) {
    throw new Error('Model returned an empty list of subgoals.');
  }

  return {
    subgoals: cleaned,
    meta: {
      model: OPENAI_MODEL,
      source: 'openai',
      provider: 'openai',
      note: 'Generated via OpenAI chat.completions endpoint.'
    }
  };
}

async function decomposeGoal(goal) {
  if (USE_HF) {
    try {
      return await callHuggingFaceModel(goal);
    } catch (error) {
      console.error('Hugging Face model error, falling back:', error.message);
    }
  }

  if (USE_OPENAI) {
    try {
      return await callOpenAIModel(goal);
    } catch (error) {
      console.error('OpenAI model error, falling back to heuristic:', error.message);
    }
  }

  return fakeHeuristicBreakdown(goal);
}

module.exports = {
  decomposeGoal
};
