const ALLOWED_OPERATIONS = new Set(['jsonLdPath', 'semanticQuery', 'nearEvidence', 'composeTextBlocks', 'readAttribute']);
const ALLOWED_FIELDS = new Set(['title', 'company', 'location', 'description', 'employmentType', 'experienceLevel', 'salary', 'skills', 'jobId', 'postedDate', 'validThrough', 'applicationUrl']);
const ALLOWED_ATTRIBUTES = new Set(['href', 'content', 'datetime']);

export function validateExtractionPlan(plan, context) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return { valid: false, errors: ['Plan must be an object'] };
  if (!Array.isArray(plan.operations) || !plan.operations.length) errors.push('Plan requires operations');
  if ((plan.operations?.length || 0) > 30) errors.push('Plan exceeds operation budget');
  const handles = new Set([...(context?.candidates || []), ...(context?.headings || []), ...(context?.actions || [])].map((item) => item.handle));
  for (const [index, operation] of (plan.operations || []).entries()) {
    if (!ALLOWED_OPERATIONS.has(operation.op)) errors.push(`Operation ${index} is not allowed`);
    if (!ALLOWED_FIELDS.has(operation.field)) errors.push(`Operation ${index} has invalid field`);
    if (operation.nodeHandle && !handles.has(operation.nodeHandle)) errors.push(`Operation ${index} references an unknown node`);
    if (operation.attribute && !ALLOWED_ATTRIBUTES.has(operation.attribute)) errors.push(`Operation ${index} reads a forbidden attribute`);
    if (/javascript:|<script|eval\s*\(|function\s*\(/i.test(JSON.stringify(operation))) errors.push(`Operation ${index} contains executable content`);
  }
  return { valid: errors.length === 0, errors, normalized: errors.length ? null : { ...plan, schemaVersion: 'astra-plan-1', maxCost: Math.min(Number(plan.maxCost) || 30, 30) } };
}
