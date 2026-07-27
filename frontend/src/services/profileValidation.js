const namePattern = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u;
const locationPattern = /^[\p{L}]+(?:[ .'\-][\p{L}]+)*$/u;
const usernamePattern = /^[a-z][a-z0-9._]{2,29}$/;
export const requiredProfileFields = ['first_name','last_name','username','phone_number','country','timezone'];

const ageOn = value => {
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age;
};

export function validateProfileField(field, raw, form = {}) {
  const value = String(raw ?? '').trim();
  if (requiredProfileFields.includes(field) && !value) return 'This field is required.';
  if (!value) return '';
  if (['first_name','last_name','preferred_name'].includes(field) && (!namePattern.test(value) || value.length > 80)) return 'Use letters, spaces, apostrophes, or hyphens only.';
  if (field === 'username') {
    const username = value.toLowerCase();
    if (!usernamePattern.test(username)) return 'Use 3–30 characters; start with a letter and use letters, numbers, dots, or underscores.';
    if (/(\.\.|__|\._|_\.)/.test(username)) return 'Do not repeat or combine username separators.';
  }
  if (field === 'date_of_birth') {
    const age = ageOn(value);
    if (age === null || age > 120) return 'Enter a valid date of birth.';
    if (age < 13) return 'You must be at least 13 years old.';
  }
  if (field === 'phone_country_code' && !/^\+[1-9]\d{0,5}$/.test(value.replace(/\s/g,''))) return 'Select a valid country calling code.';
  if (field === 'phone_number') {
    const digits = value.replace(/[\s()\-]/g,'');
    if (!/^\d{6,14}$/.test(digits)) return 'Enter 6–14 digits without the country code.';
    if (`${String(form.phone_country_code || '').replace(/\D/g,'')}${digits}`.length > 15) return 'The complete number cannot exceed 15 digits.';
  }
  if (['country','state','city'].includes(field) && (!locationPattern.test(value) || value.length > 100)) return 'Enter a valid location name.';
  if (field === 'timezone') {
    try { Intl.DateTimeFormat('en-US', { timeZone:value }).format(); } catch (_) { return 'Use a valid timezone such as Asia/Kolkata.'; }
  }
  if (field === 'years_experience' && (+value < 0 || +value > 80)) return 'Enter a value between 0 and 80.';
  if (field === 'preferred_language' && (value.length > 50 || !/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/.test(value))) return 'Enter a valid language name.';
  if (field === 'current_title' && value.length > 120) return 'Use 120 characters or fewer.';
  if (['linkedin_url','github_url','portfolio_url','website_url'].includes(field)) {
    try { const url = new URL(value); if (!['http:','https:'].includes(url.protocol)) throw new Error(); } catch (_) { return 'Enter a complete http:// or https:// URL.'; }
  }
  return '';
}

export function validateProfile(form) {
  const fields = [
    'first_name','last_name','preferred_name','username','date_of_birth','phone_country_code',
    'phone_number','country','state','city','timezone','years_experience','linkedin_url',
    'github_url','portfolio_url','website_url','preferred_language','current_title'
  ];
  return Object.fromEntries(fields.map(field => [field, validateProfileField(field, form[field], form)]).filter(([,error]) => error));
}
