// CLI over lib/course-dirs.ts's listCourses - one implementation, this the
// only caller that reads the clock-free result and prints it, following
// tools/insights.ts's shape. This is the command the find-subjects skill's
// routing step (protocol step 10) runs before ever proposing a candidate, so
// it can tell a course already under contract from one this tenant has never
// touched, without reading the ledger or mastery.
// Usage: node tools/list-courses.ts <tenant-dir> [--json]
import { listCourses } from '../lib/course-dirs.ts';

const args = process.argv.slice(2);
const tenantDir = args.find((a) => !a.startsWith('--'));
const wantJson = args.includes('--json');

if (!tenantDir) {
  console.error('usage: node tools/list-courses.ts <tenant-dir> [--json]');
  process.exit(1);
}

const courses = listCourses(tenantDir);

if (wantJson) {
  console.log(JSON.stringify(courses, null, 2));
} else if (courses.length === 0) {
  console.log('No courses found.');
} else {
  for (const c of courses) {
    const domain = c.domain ?? '(ungrouped)';
    const state = c.hasProfile ? 'under contract' : 'unstarted skeleton';
    console.log(`${domain}/${c.slug}  "${c.title}"  ${state}`);
  }
}
