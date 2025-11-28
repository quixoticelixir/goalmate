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
      note: 'Replace fakeHeuristicBreakdown() with a real neural model call (e.g., OpenAI API, local model).'
    }
  };
}

async function decomposeGoal(goal) {
  // Here you can later call a real neural model instead of the local heuristic.
  // For example:
  // - OpenAI / other provider
  // - Local model server over HTTP
  // - Python service via HTTP / queue
  return fakeHeuristicBreakdown(goal);
}

module.exports = {
  decomposeGoal
};

