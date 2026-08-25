import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchView from './SearchView';
import { searchService } from '@/services/searchService';

vi.mock('@/services/searchService', () => ({
  searchService: {
    search: vi.fn(),
  },
}));

const mockedSearch = vi.mocked(searchService.search);

function apiResponse(content: unknown[]) {
  return { data: { data: { content } } } as any;
}

const SAMPLE_RESULTS = [
  { id: 'es-1', journalId: 1, userId: 1, title: 'Hackathon Day', content: 'We built something great', mood: 'HAPPY', tags: ['coding'], createdAt: '2024-01-01T00:00:00' },
  { id: 'es-2', journalId: 2, userId: 1, title: 'Gratitude Journal', content: 'Thankful for friends', mood: 'GRATEFUL', tags: [], createdAt: '2024-03-01T00:00:00' },
];

describe('SearchView', () => {
  beforeEach(() => {
    mockedSearch.mockReset();
    mockedSearch.mockResolvedValue(apiResponse(SAMPLE_RESULTS));
  });

  it('runs an initial search on mount and renders every entry', async () => {
    render(<SearchView />);

    expect(await screen.findByText('Hackathon Day')).toBeInTheDocument();
    expect(screen.getByText('Gratitude Journal')).toBeInTheDocument();
    await waitFor(() => expect(mockedSearch).toHaveBeenCalledWith({ query: '', size: 50 }));
  });

  it('debounces typed queries and calls the backend with the query text only', async () => {
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByText('Hackathon Day');
    mockedSearch.mockClear();

    await user.type(
      screen.getByPlaceholderText('Type anything to search in real-time (e.g. hackathon, stressed, gratitude)...'),
      'gratitude'
    );

    await waitFor(
      () => expect(mockedSearch).toHaveBeenCalledWith({ query: 'gratitude', size: 50 }),
      { timeout: 2000 }
    );
    expect(await screen.findByText('Hackathon Day')).toBeInTheDocument();
  });

  it('filters already-fetched results by mood pill without issuing a new search', async () => {
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByText('Hackathon Day');
    mockedSearch.mockClear();

    await user.click(screen.getByText('STRESSED 😰'));

    expect(screen.queryByText('Hackathon Day')).not.toBeInTheDocument();
    expect(screen.getByText('No Matching Entries')).toBeInTheDocument();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('shows a "Searching..." state while a request is in flight', async () => {
    let resolveSearch!: (value: ReturnType<typeof apiResponse>) => void;
    mockedSearch.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));

    render(<SearchView />);

    expect(await screen.findByText('Searching...')).toBeInTheDocument();

    resolveSearch(apiResponse(SAMPLE_RESULTS));
    expect(await screen.findByText('Found 2 matching entries')).toBeInTheDocument();
  });

  it('shows an error message when the search request fails', async () => {
    mockedSearch.mockReset();
    mockedSearch.mockRejectedValue(new Error('network down'));

    render(<SearchView />);

    expect(await screen.findByText('Search failed. Please try again.')).toBeInTheDocument();
  });

  it('shows the empty state when there are no matches', async () => {
    mockedSearch.mockReset();
    mockedSearch.mockResolvedValue(apiResponse([]));

    render(<SearchView />);

    expect(await screen.findByText('No Matching Entries')).toBeInTheDocument();
  });

  it('sorts results client-side and re-sorts on demand', async () => {
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByText('Hackathon Day');

    let titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Gratitude Journal', 'Hackathon Day']);

    await user.selectOptions(screen.getByDisplayValue('Newest First'), 'oldest');

    titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Hackathon Day', 'Gratitude Journal']);
  });
});
