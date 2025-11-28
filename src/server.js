const path = require('path');
const express = require('express');
const cors = require('cors');
const { decomposeGoal } = require('./services/goalDecomposer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/api/goals/decompose', async (req, res) => {
  try {
    const { goal } = req.body || {};

    if (!goal || typeof goal !== 'string' || !goal.trim()) {
      return res.status(400).json({ error: 'Goal is required and must be a non-empty string.' });
    }

    const result = await decomposeGoal(goal.trim());

    return res.json({
      goal: goal.trim(),
      subgoals: result.subgoals,
      meta: result.meta
    });
  } catch (error) {
    console.error('Error in /api/goals/decompose:', error);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

