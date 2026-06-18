// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-13
// Updated: 2026-06-20

// Module: select/utils/dates
// Date arithmetic helpers built around a canonical `DateNum` representation.
//
// Supported representations:
// - DateNum: internal linear millisecond date number used by this module
// - DateTuple: `[year, month, day, hour, minute, second]`
// - Timestamp: Unix epoch time in seconds
// - Date: JavaScript `Date`
//
// Canonical representation:
// - All arithmetic APIs operate on `DateNum`
//
// Conversion rules:
// - `DateTuple` and `DateNum` are civil time values without timezone metadata
// - `Timestamp` and `Date` conversions use UTC fields

const MS_PER_MINUTE = 1000 * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

// Calendar constants
const DAYS_PER_YEAR = 365;
const DAYS_PER_LEAP_YEAR = 366;
const DAYS_PER_4_YEARS = 1461;
const DAYS_PER_100_YEARS = 36524;
const DAYS_PER_400_YEARS = 146097;

const YEAR_MONTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const YEAR_DAYS = YEAR_MONTHS.reduce((r, _, i) => {
	r[i] = i === 0 ? 0 : r[i - 1] + YEAR_MONTHS[i - 1];
	return r;
}, new Array(12));

const LEAP_YEAR_MONTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const LEAP_YEAR_DAYS = LEAP_YEAR_MONTHS.reduce((r, _, i) => {
	r[i] = i === 0 ? 0 : r[i - 1] + LEAP_YEAR_MONTHS[i - 1];
	return r;
}, new Array(12));

const SPLIT_DAYS = 578191;

const Second = {
	index: 6,
	step: 1000,
	offset: 0,
	suffix: "s",
	period: 60,
};

const Minute = {
	index: 5,
	step: MS_PER_MINUTE,
	offset: 0,
	suffix: "m",
	period: 60,
};

const Hour = {
	index: 4,
	step: MS_PER_HOUR,
	offset: 0,
	suffix: "h",
	period: 24,
};

const Day = {
	index: 3,
	step: MS_PER_DAY,
	offset: 1,
	suffix: "d",
	period: 30.4375,
};

const Week = {
	index: 2,
	step: MS_PER_DAY * 7,
	offset: 1,
	suffix: "w",
};

const Month = {
	index: 1,
	step: DAYS_PER_4_YEARS * 1800000,
	period: 12,
	offset: 1,
	suffix: "M",
};

const Year = {
	index: 0,
	step: (365 * 3 + 366) * MS_PER_HOUR * 6,
	offset: 0,
	suffix: "Y",
};

const by = Object.freeze({
	second: Second,
	minute: Minute,
	hour: Hour,
	day: Day,
	week: Week,
	month: Month,
	year: Year,
});

const WeekDay = {
	values: {
		Monday: 0,
		Tuesday: 1,
		Wednesday: 2,
		Thursday: 3,
		Friday: 4,
		Saturday: 5,
		Sunday: 6,
	},
	names: [
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
		"Sunday",
	],
};

// ----------------------------------------------------------------------------
//
// CORE
//
// ----------------------------------------------------------------------------

// Function: div
// Integer division of `value` by `divisor`. When `period` is given, wraps the
// quotient into that period with optional `offset`.
function div(value, divisor, period, offset = 0) {
	return period
		? ((Math.floor(value / divisor) - offset) % period) + offset
		: Math.floor(value / divisor);
}

// Function: divmul
// Returns the largest multiple of `divisor` less than or equal to `value`.
function divmul(value, divisor) {
	return div(value, divisor) * divisor;
}

// Function: isleap
// Returns true when `year` is a leap year.
function isleap(year) {
	return year < 0 || year % 4 !== 0
		? false
		: year <= 1582
			? true
			: year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

// Function: leaps
// Returns the number of leap years from year 0 up to but excluding `year`.
function leaps(year) {
	if (year < 0) {
		return 0;
	}

	if (year <= 1582) {
		return Math.floor(year / 4) + 1;
	}

	const gregTotal =
		Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + 1;

	return gregTotal + 12;
}

// Function: yeardays
// Returns the number of days in `year`, or the cumulative day offset before
// `month` when `month` is provided.
function yeardays(year, month) {
	return month === undefined
		? isleap(year)
			? 366
			: 365
		: isleap(year)
			? LEAP_YEAR_DAYS[month - 1]
			: YEAR_DAYS[month - 1];
}

// Function: monthdays
// Returns the number of days in `month` of `year`.
function monthdays(year, month) {
	return isleap(year) ? LEAP_YEAR_MONTHS[month - 1] : YEAR_MONTHS[month - 1];
}

// Function: datedays
// Returns the absolute day count up to the start of the given date.
function datedays(year, month, day) {
	return (
		year * 365 +
		leaps(year - 1) +
		(month && month > 1 ? yeardays(year, month) : 0) +
		(day && day > 1 ? day - 1 : 0)
	);
}

// ----------------------------------------------------------------------------
//
// CONVERSION
//
// ----------------------------------------------------------------------------

// Function: fromTuple
// Converts a `DateTuple` to a canonical `DateNum`.
function fromTuple(value) {
	return (
		datedays(value[0], value[1] || 1, value[2] || 1) * by.day.step +
		(value[3] || 0) * by.hour.step +
		(value[4] || 0) * by.minute.step +
		(value[5] || 0) * by.second.step
	);
}

// Function: fromDate
// Converts a JavaScript `Date` to a canonical `DateNum` using UTC fields.
function fromDate(value) {
	return fromTuple([
		value.getUTCFullYear(),
		value.getUTCMonth() + 1,
		value.getUTCDate(),
		value.getUTCHours(),
		value.getUTCMinutes(),
		value.getUTCSeconds(),
	]);
}

// Function: fromTimestamp
// Converts an epoch `Timestamp` in seconds to a canonical `DateNum`.
function fromTimestamp(value) {
	return fromDate(new Date(value * 1000));
}

// Function: numdatej
// Converts total days to year/day-of-year using Julian calendar rules.
function numdatej(days) {
	let y = 0;
	let d = 0;
	const c4 = Math.floor(days / DAYS_PER_4_YEARS);
	y += c4 * 4;
	d = days - c4 * DAYS_PER_4_YEARS;

	if (d >= DAYS_PER_LEAP_YEAR) {
		d -= DAYS_PER_LEAP_YEAR;
		y += 1;
		const c1 = Math.floor(d / DAYS_PER_YEAR);
		y += c1;
		d -= c1 * DAYS_PER_YEAR;
	}
	return { y, d };
}

// Function: numdateg
// Converts total days to year/day-of-year using Gregorian calendar rules.
function numdateg(days) {
	let y = 0;
	let d = 0;
	let g = days - 12;

	const c400 = Math.floor(g / DAYS_PER_400_YEARS);
	y += c400 * 400;
	g -= c400 * DAYS_PER_400_YEARS;

	let c100 = 0;
	if (g >= DAYS_PER_100_YEARS + 1) {
		g -= DAYS_PER_100_YEARS + 1;
		c100 = 1;
		const c = Math.floor(g / DAYS_PER_100_YEARS);
		const safeC = c > 2 ? 2 : c;
		c100 += safeC;
		g -= safeC * DAYS_PER_100_YEARS;
	}
	y += c100 * 100;

	const isLeapCentury = c100 === 0;

	if (isLeapCentury) {
		const c4 = Math.floor(g / DAYS_PER_4_YEARS);
		y += c4 * 4;
		g -= c4 * DAYS_PER_4_YEARS;

		if (g >= DAYS_PER_LEAP_YEAR) {
			const c1 = 1 + Math.floor((g - DAYS_PER_LEAP_YEAR) / DAYS_PER_YEAR);
			y += c1;
			g -= DAYS_PER_LEAP_YEAR + (c1 - 1) * DAYS_PER_YEAR;
		}
		d = g;
	} else {
		if (g < DAYS_PER_4_YEARS - 1) {
			const c1 = Math.floor(g / DAYS_PER_YEAR);
			y += c1;
			d = g - c1 * DAYS_PER_YEAR;
		} else {
			g -= DAYS_PER_4_YEARS - 1;
			y += 4;

			const c4 = Math.floor(g / DAYS_PER_4_YEARS);
			y += c4 * 4;
			g -= c4 * DAYS_PER_4_YEARS;

			if (g >= DAYS_PER_LEAP_YEAR) {
				const c1 = 1 + Math.floor((g - DAYS_PER_LEAP_YEAR) / DAYS_PER_YEAR);
				y += c1;
				g -= DAYS_PER_LEAP_YEAR + (c1 - 1) * DAYS_PER_YEAR;
			}
			d = g;
		}
	}

	return { y, d };
}

// Function: toTuple
// Converts a canonical `DateNum` to a `DateTuple`.
function toTuple(value) {
	const days = Math.floor(value / by.day.step);
	let y = 0;
	let d = 0;

	if (days < SPLIT_DAYS) {
		const res = numdatej(days);
		y = res.y;
		d = res.d;
	} else {
		const res = numdateg(days);
		y = res.y;
		d = res.d;
	}

	const daysArr = isleap(y) ? LEAP_YEAR_DAYS : YEAR_DAYS;
	let m = 11;
	while (m > 0 && daysArr[m] > d) {
		m--;
	}

	const day = d - daysArr[m] + 1;

	let remainder = value - days * by.day.step;
	const h = Math.floor(remainder / by.hour.step);
	remainder -= h * by.hour.step;
	const mn = Math.floor(remainder / by.minute.step);
	remainder -= mn * by.minute.step;
	const s = Math.floor(remainder / by.second.step);

	return [y, m + 1, day, h, mn, s];
}

// Function: toDate
// Converts a canonical `DateNum` to a JavaScript `Date` using UTC fields.
function toDate(value) {
	const tuple = toTuple(value);
	return new Date(
		Date.UTC(tuple[0], tuple[1] - 1, tuple[2], tuple[3], tuple[4], tuple[5]),
	);
}

// Function: toTimestamp
// Converts a canonical `DateNum` to an epoch `Timestamp` in seconds.
function toTimestamp(value) {
	return Math.floor(toDate(value).getTime() / 1000);
}

// ----------------------------------------------------------------------------
//
// ARITHMETIC
//
// ----------------------------------------------------------------------------

// Function: snap
// Rounds `dateNum` down to the nearest multiple of `grain`.
function snap(dateNum, grain) {
	return divmul(dateNum, grain.step);
}

// Function: dist
// Returns the approximate duration between two canonical `DateNum` values.
function dist(d1, d2) {
	const delta = Math.abs((d2 ?? 0) - d1);
	const sign = d2 !== undefined && d2 < d1 ? -1 : 1;

	let remainder = delta;
	const years = Math.floor(remainder / by.year.step);
	remainder %= by.year.step;
	const months = Math.floor(remainder / by.month.step);
	remainder %= by.month.step;
	const days = Math.floor(remainder / by.day.step);
	remainder %= by.day.step;
	const hours = Math.floor(remainder / by.hour.step);
	remainder %= by.hour.step;
	const minutes = Math.floor(remainder / by.minute.step);
	remainder %= by.minute.step;
	const seconds = Math.floor(remainder / by.second.step);

	return [
		sign * years,
		sign * months,
		sign * days,
		sign * hours,
		sign * minutes,
		sign * seconds,
	];
}

// Function: diffcal
// Returns the exact calendar difference between two canonical `DateNum` values.
function diffcal(n1, n2) {
	let start = n1;
	let end = n2;
	let sign = 1;
	if (start > end) {
		start = n2;
		end = n1;
		sign = -1;
	}

	const d1 = toTuple(start);
	const d2 = toTuple(end);

	let years = d2[0] - d1[0];
	let months = d2[1] - d1[1];
	let days = d2[2] - d1[2];
	let hours = d2[3] - d1[3];
	let minutes = d2[4] - d1[4];
	let seconds = d2[5] - d1[5];

	if (seconds < 0) {
		seconds += 60;
		minutes--;
	}
	if (minutes < 0) {
		minutes += 60;
		hours--;
	}
	if (hours < 0) {
		hours += 24;
		days--;
	}
	if (days < 0) {
		let pm = d2[1] - 1;
		let py = d2[0];
		if (pm < 1) {
			pm = 12;
			py--;
		}
		days += monthdays(py, pm);
		months--;
	}
	if (months < 0) {
		months += 12;
		years--;
	}

	return [
		sign * years === 0 ? 0 : sign * years,
		sign * months === 0 ? 0 : sign * months,
		sign * days === 0 ? 0 : sign * days,
		sign * hours === 0 ? 0 : sign * hours,
		sign * minutes === 0 ? 0 : sign * minutes,
		sign * seconds === 0 ? 0 : sign * seconds,
	];
}

// ----------------------------------------------------------------------------
//
// CALENDAR HELPERS
//
// ----------------------------------------------------------------------------

// Function: weekday
// Returns the weekday index for the given date. Monday is `0` by default.
function weekday(year, month, day, firstDay = 0) {
	const s = div(year, 100);
	let sday =
		1720996.5 -
		s +
		div(s, 4) +
		Math.floor(365.25 * year) +
		Math.floor(30.6001 * (month + 1)) +
		day;
	sday -= div(sday, 7) * 7;
	const wday = (Math.floor(sday) + 1) % 7;
	return (wday + (7 - firstDay)) % 7;
}

// Function: timezone
// Returns the current timezone offset in milliseconds.
function timezone() {
	return new Date().getTimezoneOffset() * MS_PER_MINUTE;
}

// Function: now
// Returns the current instant as a canonical `DateNum` using UTC fields.
function now() {
	return fromDate(new Date());
}

// Function: year
// Returns the year component from a canonical `DateNum`, or the current year.
function year(value = undefined) {
	return toTuple(value === undefined ? now() : value)[0];
}

// Function: month
// Returns the month component from a canonical `DateNum`, or the current month.
function month(value = undefined) {
	return toTuple(value === undefined ? now() : value)[1];
}

// Function: day
// Returns the day component from a canonical `DateNum`, or the current day.
function day(value = undefined) {
	return toTuple(value === undefined ? now() : value)[2];
}

// Function: hour
// Returns the hour component from a canonical `DateNum`, or the current hour.
function hour(value = undefined) {
	return toTuple(value === undefined ? now() : value)[3];
}

// Function: minute
// Returns the minute component from a canonical `DateNum`, or the current minute.
function minute(value = undefined) {
	return toTuple(value === undefined ? now() : value)[4];
}

// Function: second
// Returns the second component from a canonical `DateNum`, or the current second.
function second(value = undefined) {
	return toTuple(value === undefined ? now() : value)[5];
}

// Function: months
// Returns the first day of every month in the year of `value` as `DateNum`.
function months(value = undefined) {
	const p = toTuple(value === undefined ? now() : value);
	const res = new Array(12);
	for (let i = 0; i < 12; i++) {
		res[i] = fromTuple([p[0], i + 1, 1]);
	}
	return res;
}

// Function: days
// Returns every day in the month of `value` as `DateNum`.
function days(value = undefined) {
	const p = toTuple(value === undefined ? now() : value);
	const n = monthdays(p[0], p[1]);
	const res = new Array(n);
	for (let i = 0; i < n; i++) {
		res[i] = fromTuple([p[0], p[1], i + 1]);
	}
	return res;
}

// Function: week
// Returns the start of the calendar week containing `value` as `DateNum`.
// `offset` follows <weekday>, where Monday is `0` and Sunday is `6`.
function week(value = undefined, offset = 0) {
	const p = toTuple(value === undefined ? now() : value);
	const wday = (weekday(p[0], p[1], p[2]) + 1) % 7;
	const delta = (wday - offset + 7) % 7;
	return fromTuple([p[0], p[1], p[2]]) - delta * MS_PER_DAY;
}

// Function: weeks
// Returns the start of each calendar week intersecting the month of `value` as
// `DateNum`. `offset` follows <weekday>, where Monday is `0` and Sunday is `6`.
function weeks(value = undefined, offset = 0) {
	const p = toTuple(value === undefined ? now() : value);
	const endDay = monthdays(p[0], p[1]);
	const start = week(fromTuple([p[0], p[1], 1]), offset);
	const end = week(fromTuple([p[0], p[1], endDay]), offset);
	const span = Math.floor((end - start) / (MS_PER_DAY * 7)) + 1;
	const res = new Array(span);
	let current = start;
	for (let i = 0; i < span; i++) {
		res[i] = current;
		current += MS_PER_DAY * 7;
	}
	return res;
}

export {
	by,
	Day,
	datedays,
	day,
	days,
	diffcal,
	dist,
	div,
	divmul,
	fromDate,
	fromTimestamp,
	fromTuple,
	Hour,
	hour,
	isleap,
	LEAP_YEAR_DAYS,
	LEAP_YEAR_MONTHS,
	leaps,
	Minute,
	Month,
	MS_PER_DAY,
	MS_PER_HOUR,
	MS_PER_MINUTE,
	minute,
	month,
	monthdays,
	months,
	now,
	Second,
	SPLIT_DAYS,
	second,
	snap,
	timezone,
	toDate,
	toTimestamp,
	toTuple,
	Week,
	WeekDay,
	week,
	weekday,
	weeks,
	YEAR_DAYS,
	YEAR_MONTHS,
	Year,
	year,
	yeardays,
};

// EOF
