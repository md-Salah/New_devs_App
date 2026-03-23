export function humanizeTenure(iso?: string | null): string | null {
    if (!iso) return null;
    const start = new Date(iso);
    if (isNaN(start.getTime())) return null;

    const now = new Date();

    // Handle future dates (pre-boarding)
    const future = start.getTime() > now.getTime();

    let y = now.getFullYear() - start.getFullYear();
    let m = now.getMonth() - start.getMonth();
    let d = now.getDate() - start.getDate();

    if (d < 0) {
        // borrow days from previous month
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        d += prevMonth;
        m -= 1;
    }
    if (m < 0) {
        m += 12;
        y -= 1;
    }

    // For future dates, recompute from start to now to get positive components
    if (future) {
        y = Math.max(0, -y);
        m = Math.max(0, -m);
        d = Math.max(0, -d);
    }

    const parts = [];
    if (y) parts.push(`${y} year${y === 1 ? '' : 's'}`);
    if (m) parts.push(`${m} month${m === 1 ? '' : 's'}`);
    if (d) parts.push(`${d} day${d === 1 ? '' : 's'}`);

    const span = parts.length ? parts.join(', ').replace(/, ([^,]*)$/, ' and $1') : '0 days';

    return future ? `Starts in ${span}` : `Joined ${span} ago`;
}

