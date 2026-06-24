// =================================================================
// MODULE 4: AUTOMATED TIMELINE SCHEDULING MATH MATRIX HELPER
// =================================================================

// const buildLocalDate = (d, t) => d && /^(\d|2[0-3]):([0-5]\d)$/.test(t) ? new Date(`${d}T${t}:00`) : null;
// const addDays = (d, days) => { const next = new Date(d.getTime()); next.setDate(next.getDate() + days); return next; };
// const addMonthsSafe = (d, m, td) => { const next = new Date(d.getTime()); next.setMonth(next.getMonth() + m, 1); next.setDate(Math.min(td, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())); return next; };

// FIX: Updated regex to properly support optional leading zeros for hours (00-23 or 0-23)
const buildLocalDate = (d, t) => {
    if (!d || !t) return null;
    const isValidTime = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.test(t);
    return isValidTime ? new Date(`${d}T${t}:00`) : null;
};

const addDays = (d, days) => { const next = new Date(d.getTime()); next.setDate(next.getDate() + days); return next; };
const addMonthsSafe = (d, m, td) => { const next = new Date(d.getTime()); next.setMonth(next.getMonth() + m, 1); next.setDate(Math.min(td, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())); return next; };

function calculateFirstScheduleDate({ scheduleMode, scheduleAt, startDate, time, weeklyDay, monthlyDay }) {
    if (scheduleMode === 'CUSTOM') {
        return new Date(scheduleAt).getTime() > Date.now() ? { success: true, date: new Date(scheduleAt) } : { success: false, error: 'Target time parameters must reside in the future.' };
    }
    console.log("1"+startDate," | ", time, " | ", weeklyDay, " | ", monthlyDay)
    let first = buildLocalDate(startDate, time);
    console.log("2"+first)
    if (!first) return { success: false, error: 'Invalid configuration payload start parameters.' };

    if (scheduleMode === 'DAILY') { while (first.getTime() <= Date.now()) first = addDays(first, 1); return { success: true, date: first }; }
    if (scheduleMode === 'WEEKLY') { while (first.getDay() !== parseInt(weeklyDay,10) || first.getTime() <= Date.now()) first = addDays(first, 1); return { success: true, date: first }; }
    if (scheduleMode === 'MONTHLY') { first.setDate(Math.min(parseInt(monthlyDay,10), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate())); while (first.getTime() <= Date.now()) first = addMonthsSafe(first, 1, parseInt(monthlyDay,10)); return { success: true, date: first }; }
    
    return { success: false, error: 'Unknown execution routine interval model context.' };
}

function calculateNextRun(s) {
    if (!s.scheduleMode || s.scheduleMode === 'CUSTOM') return null;
    let next = s.scheduleAt ? new Date(s.scheduleAt) : new Date();
    if (s.scheduleMode === 'DAILY') do { next = addDays(next, 1); } while (next.getTime() <= Date.now());
    if (s.scheduleMode === 'WEEKLY') do { next = addDays(next, 7); } while (next.getTime() <= Date.now());
    if (s.scheduleMode === 'MONTHLY') do { next = addMonthsSafe(next, 1, parseInt(s.monthlyDay || next.getDate(), 10)); } while (next.getTime() <= Date.now());
    return next;
}

const getStatusCounts = (arr) => ({ ALL: arr.length, SCHEDULED: arr.filter(i => i.status === 'SCHEDULED').length, PROCESSING: arr.filter(i => i.status === 'PROCESSING').length, PARTIAL: arr.filter(i => i.status === 'PARTIAL').length, SENT: arr.filter(i => i.status === 'SENT').length, FAILED: arr.filter(i => i.status === 'FAILED').length, CANCELLED: arr.filter(i => i.status === 'CANCELLED').length });

function pushRunHistory(schedule, payload) {
    if (!Array.isArray(schedule.runHistory)) schedule.runHistory = [];
    schedule.runHistory.push({ runId: 'RUN-' + Date.now(), runAt: new Date().toISOString(), status: payload.status || schedule.status, successCount: payload.successCount || 0, failedCount: payload.failedCount || 0, total: payload.total || 0, results: payload.results || [], filesSent: payload.filesSent || [], error: payload.error || null });
    if (schedule.runHistory.length > 50) schedule.runHistory = schedule.runHistory.slice(-50);
}

module.exports = {
    calculateFirstScheduleDate,
    calculateNextRun,
    getStatusCounts,
    pushRunHistory
};
