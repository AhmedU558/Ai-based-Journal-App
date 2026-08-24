import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): ReactElement {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>real content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('real content')).toBeInTheDocument();
  });

  it('renders a fallback UI instead of crashing when a child throws', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
