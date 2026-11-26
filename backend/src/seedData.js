// Demo content shared by `npm run seed` and by in-memory demo mode.
// Everything here is invented: no real business, staff or customers.
import { hashPassword } from './auth/passwords.js';

export async function seedDemoData(repo, { adminEmail, adminPassword, log = () => {} } = {}) {
  if ((await repo.countServices()) === 0) {
    const consult = await repo.createService({ name: 'Initial consultation', description: 'A first conversation about what you need.', durationMinutes: 30, priceCents: 150000 });
    const followUp = await repo.createService({ name: 'Follow-up', description: 'A short check-in after a previous visit.', durationMinutes: 15, priceCents: 80000 });
    const standard = await repo.createService({ name: 'Standard session', description: 'A full one-hour session.', durationMinutes: 60, priceCents: 300000 });
    const extended = await repo.createService({ name: 'Extended session', description: 'A longer session for bigger needs.', durationMinutes: 90, priceCents: 420000 });

    const weekdays = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }));
    const saturday = [{ weekday: 6, start: '09:00', end: '13:00' }];
    const team = [
      { name: 'Amina', services: [consult, followUp, standard, extended], hours: [...weekdays, ...saturday] },
      { name: 'Brian', services: [consult, followUp, standard], hours: weekdays },
      { name: 'Chebet', services: [followUp, standard, extended], hours: [...weekdays.map((h) => ({ ...h, start: '10:00', end: '18:00' })), ...saturday] },
    ];
    for (const member of team) {
      const person = await repo.createStaff({ name: member.name });
      for (const s of member.services) await repo.linkStaffService(person.id, s.id);
      await repo.setStaffHours(person.id, member.hours);
    }
    log('Seeded 4 services, 3 staff members and opening hours.');
  } else {
    log('Services already exist: skipping demo services.');
  }

  if (adminEmail && adminPassword) {
    if (!(await repo.findUserByEmail(adminEmail))) {
      await repo.createUser({ email: adminEmail, passwordHash: await hashPassword(adminPassword), fullName: 'Studio Admin', role: 'ADMIN' });
      log(`Created admin account ${adminEmail}.`);
    } else {
      log('Admin account already exists.');
    }
  }
}
