import { describe, it, expect } from 'vitest';
import { employeeVisibleOnStaffField } from './staffRoles';

describe('employeeVisibleOnStaffField', () => {
  it('shows a coach whose role matches the field, ignoring case and spacing', () => {
    expect(employeeVisibleOnStaffField(['Goalie Coach'], 'Goalie Coach')).toBe(true);
    expect(employeeVisibleOnStaffField(['  goalie coach '], 'Goalie Coach')).toBe(true);
  });

  it('shows a coach with several roles when one of them matches', () => {
    expect(employeeVisibleOnStaffField(['Skills Coach', 'Goalie Coach'], 'Goalie Coach')).toBe(true);
  });

  it('hides a coach whose roles are other fields', () => {
    expect(employeeVisibleOnStaffField(['Skills Coach'], 'Goalie Coach')).toBe(false);
  });

  it('hides a coach with no roles or only a generic role', () => {
    expect(employeeVisibleOnStaffField([], 'Goalie Coach')).toBe(false);
    expect(employeeVisibleOnStaffField(undefined, 'Goalie Coach')).toBe(false);
    expect(employeeVisibleOnStaffField(['Coach'], 'Goalie Coach')).toBe(false);
  });
});
