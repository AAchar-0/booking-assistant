// The tools the AI assistant may call. Design rule that makes this safe:
//
//   READ tools   (list_services, get_availability, list_my_bookings) just look things up.
//   PROPOSE tools (propose_booking, propose_cancellation) change NOTHING. They check that the action would be
//   allowed and return a "proposal" that the website shows as a card with a Confirm button.
//
// So the model can never book or cancel by itself: a human must press the button, and that button calls the
// normal, fully-checked REST endpoint. Even a tricked model (prompt injection) cannot cause harm.
import { parse, v } from '../http/validate.js';
import { badRequest, notFound } from '../http/errors.js';
import { utcToLocal } from '../time/zones.js';

const money = (service) => `${service.currency} ${(service.priceCents / 100).toLocaleString('en-US')}`;

export const toolDefinitions = [
  {
    name: 'list_services',
    description: 'List the services that can be booked, with id, duration and price. Call this before anything else when the customer has not given an exact service id.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_availability',
    description: 'List free start times (local business time) for one service on one date. Never guess availability: always call this.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'integer', description: 'Id from list_services' },
        date: { type: 'string', description: 'Calendar date, YYYY-MM-DD, in the business time zone' },
      },
      required: ['service_id', 'date'], additionalProperties: false,
    },
  },
  {
    name: 'list_my_bookings',
    description: "List the logged-in customer's upcoming bookings (with ids).",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'propose_booking',
    description: 'Propose a booking to the customer. Nothing is booked yet: the customer must press Confirm in the chat. Use a starts_at value copied exactly from get_availability.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'integer' },
        starts_at: { type: 'string', description: 'The startsAt value from get_availability (ISO date-time)' },
      },
      required: ['service_id', 'starts_at'], additionalProperties: false,
    },
  },
  {
    name: 'propose_cancellation',
    description: 'Propose cancelling one of the customer\'s bookings. Nothing is cancelled yet: the customer must press Confirm.',
    input_schema: {
      type: 'object',
      properties: { booking_id: { type: 'integer', description: 'Id from list_my_bookings' } },
      required: ['booking_id'], additionalProperties: false,
    },
  },
];

// Each runner receives ctx = { user, svc, config, clock, proposals } and the model's input; it returns plain data.
export const toolRunners = {
  async list_services({ svc, config }) {
    return (await svc.listServices()).map((s) => ({
      id: s.id, name: s.name, description: s.description, durationMinutes: s.durationMinutes, price: money(s), timezone: config.business.timezone,
    }));
  },

  async get_availability({ svc }, input) {
    const { service_id, date } = parse({ service_id: v.int({ min: 1 }), date: v.date() }, input);
    const result = await svc.getAvailability({ serviceId: service_id, date });
    return {
      date: result.date, service: result.service.name, durationMinutes: result.service.durationMinutes,
      freeStartTimes: result.slots.slice(0, 40).map((s) => ({ localTime: s.localTime, startsAt: s.startsAt })),
      note: result.slots.length === 0 ? 'No free times on this date.' : result.slots.length > 40 ? 'Only the first 40 times are shown.' : undefined,
    };
  },

  async list_my_bookings({ svc }, _input, ctx) {
    const mine = await svc.listMyBookings(ctx.user);
    return mine.filter((b) => b.status === 'CONFIRMED' && Date.parse(b.endsAt) > ctx.clock())
      .map((b) => ({ id: b.id, service: b.serviceName, date: b.local.date, localTime: b.local.time }));
  },

  async propose_booking({ svc, config, proposals }, input, ctx) {
    const { service_id, starts_at } = parse({ service_id: v.int({ min: 1 }), starts_at: v.instant() }, input);
    const date = utcToLocal(Date.parse(starts_at), config.business.timezone).date;
    const availability = await svc.getAvailability({ serviceId: service_id, date });
    const slot = availability.slots.find((s) => s.startsAt === starts_at);
    if (!slot) throw badRequest('That start time is not available. Call get_availability and use one of its times.');
    const service = (await svc.listServices()).find((s) => s.id === service_id);
    const proposal = {
      type: 'BOOK', serviceId: service_id, serviceName: service.name, startsAt: slot.startsAt, endsAt: slot.endsAt,
      local: { date, time: slot.localTime }, price: money(service),
    };
    proposals.push(proposal);
    return { status: 'PROPOSED_NOT_BOOKED', shownToCustomer: proposal,
      instruction: 'The customer now sees a Confirm button. Tell them to press it to finish. Do not say it is booked.' };
  },

  async propose_cancellation({ svc, config, proposals }, input, ctx) {
    const { booking_id } = parse({ booking_id: v.int({ min: 1 }) }, input);
    const mine = await svc.listMyBookings(ctx.user);
    const booking = mine.find((b) => b.id === booking_id && b.status === 'CONFIRMED');
    if (!booking) throw notFound('No active booking with that id for this customer.');
    if (Date.parse(booking.startsAt) - ctx.clock() < config.booking.cancelMinHours * 3_600_000) {
      throw badRequest(`Bookings can only be cancelled up to ${config.booking.cancelMinHours} hours before the start.`);
    }
    const proposal = { type: 'CANCEL', bookingId: booking.id, serviceName: booking.serviceName, startsAt: booking.startsAt, local: booking.local };
    proposals.push(proposal);
    return { status: 'PROPOSED_NOT_CANCELLED', shownToCustomer: proposal,
      instruction: 'The customer now sees a Confirm button. Tell them to press it to finish. Do not say it is cancelled.' };
  },
};
