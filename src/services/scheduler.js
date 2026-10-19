const { evaluateOfflineAlerts } = require('./alertEvaluation');

let schedulerInterval = null;

function startScheduler(intervalMs = 60000) {
  if (schedulerInterval) {
    return;
  }

  schedulerInterval = setInterval(async () => {
    try {
      await evaluateOfflineAlerts();
    } catch (error) {
      console.error('Scheduler error:', error.message);
    }
  }, intervalMs);

  schedulerInterval.unref();
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

function isSchedulerRunning() {
  return schedulerInterval !== null;
}

module.exports = {
  startScheduler,
  stopScheduler,
  isSchedulerRunning
};