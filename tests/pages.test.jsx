import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeFixture, makeFakeSupa } from './fake-supabase.js';

vi.mock('@/lib/supabase/client', () => ({ supa: () => globalThis.__fakeSupa }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import { StoreProvider } from '@/lib/store';
import Shell from '@/components/Shell';
import Dashboard from '@/app/(app)/dashboard/page';
import CalendarPage from '@/app/(app)/calendar/page';

function mount(ui, fx) {
  globalThis.__fakeSupa = makeFakeSupa(fx);
  return render(<StoreProvider>{ui}</StoreProvider>);
}

beforeEach(() => localStorage.clear());

describe('parent experience', () => {
  it('dashboard greets by name and shows custody, balance, and activities', async () => {
    mount(<Dashboard />, makeFixture());
    await waitFor(() => screen.getByText(/Hello, Nate/));
    // anchor = today, so tonight is an "h" night — named after the parent now
    expect(screen.getAllByText('Nate').length).toBeGreaterThan(0);
    // balance: co-parent paid $100, our share 75%
    expect(screen.getByText('$75.00')).toBeTruthy();
    // week list shows the one-off activity
    expect(screen.getAllByText(/Soccer/).length).toBeGreaterThan(0);
    // open to-do listed
    expect(screen.getByText('Turn in camp form')).toBeTruthy();
  });

  it('shell shows the full nav and notification bell', async () => {
    mount(<Shell><div>page</div></Shell>, makeFixture());
    await waitFor(() => screen.getByText('Expenses'));
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByTitle('Notifications')).toBeTruthy();
  });

  it('calendar renders with multiple arrangements, named after the kids', async () => {
    mount(<CalendarPage />, makeFixture({ twoArrangements: true }));
    await waitFor(() => screen.getByText('All kids'));
    // tabs show derived names
    expect(screen.getByText('Jude & Molly')).toBeTruthy();
    expect(screen.getByText('Kai')).toBeTruthy();
    // list view renders per-arrangement labels (regression: arrName import)
    fireEvent.click(screen.getByLabelText('List view'));
    await waitFor(() => screen.getAllByText(/Jude & Molly/));
  });

  it('dashboard renders with multiple arrangements', async () => {
    mount(<Dashboard />, makeFixture({ twoArrangements: true }));
    await waitFor(() => screen.getByText(/Hello, Nate/));
    expect(screen.getAllByText('Jude & Molly').length).toBeGreaterThan(0);
  });

  it('calendar toggles between grid and list views', async () => {
    mount(<CalendarPage />, makeFixture());
    await waitFor(() => screen.getByLabelText('List view'));
    // grid view first: weekday headers visible
    expect(screen.getByText('Sun')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('List view'));
    // list view: activity rows appear
    await waitFor(() => screen.getAllByText(/Soccer/));
    expect(localStorage.getItem('fp_calview')).toBe('list');
  });
});

describe('child experience', () => {
  it('dashboard greets the child and uses kid-facing labels', async () => {
    mount(<Dashboard />, makeFixture({ asChild: true }));
    await waitFor(() => screen.getByText(/Hello, Molly/));
    // anchor = today → with Dad tonight (kid label, not "Us")
    expect(screen.getAllByText('Dad').length).toBeGreaterThan(0);
    // no balance card for children
    expect(screen.queryByText(/Balance/)).toBe(null);
  });

  it('shell hides parent-only nav and the bell', async () => {
    mount(<Shell><div>page</div></Shell>, makeFixture({ asChild: true }));
    await waitFor(() => screen.getByText('Calendar'));
    expect(screen.queryByText('Expenses')).toBe(null);
    expect(screen.queryByText('Settings')).toBe(null);
    expect(screen.queryByTitle('Notifications')).toBe(null);
    expect(screen.getByText('To-Dos')).toBeTruthy();
  });

  it('calendar hides the propose button for children', async () => {
    mount(<CalendarPage />, makeFixture({ asChild: true }));
    await waitFor(() => screen.getByText('Sun'));
    expect(screen.queryByText('+ Propose change')).toBe(null);
  });
});
