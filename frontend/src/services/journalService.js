import api from './api';

export const journalService = {
  getAllJournals: async () => {
    const res = await api.get('/api/v1/journals');
    if (res?.data?.data?.content && Array.isArray(res.data.data.content)) {
      return res.data.data.content;
    }
    if (res?.data?.content && Array.isArray(res.data.content)) {
      return res.data.content;
    }
    if (res?.data && Array.isArray(res.data)) {
      return res.data;
    }
    return Array.isArray(res) ? res : [];
  },

  getJournalById: async (id) => {
    return await api.get(`/api/v1/journals/${id}`);
  },

  createJournal: async (journalData) => {
    const payload = {
      title: journalData.title,
      content: journalData.content,
      mood: journalData.mood || 'HAPPY',
      tags: journalData.tags || [],
      isDraft: false,
      isPinned: false,
      isFavorite: false,
      isArchived: false,
      contentEncrypted: false
    };
    return await api.post('/api/v1/journals', payload);
  },

  updateJournal: async (id, journalData) => {
    // Deliberately NOT sending isDraft/isPinned/isFavorite/isArchived/
    // contentEncrypted here - this is an edit-form save, which only ever
    // knows about title/content/mood/tags, never the journal's pin/favorite/
    // archive state. journal-service's updateJournal already skips any field
    // that's omitted from the request body, leaving the existing value
    // untouched - sending explicit `false` for all of these used to silently
    // un-pin/un-favorite/un-archive a journal on every single edit.
    const payload = {
      title: journalData.title,
      content: journalData.content,
      mood: journalData.mood || 'HAPPY',
      tags: journalData.tags || [],
    };
    return await api.put(`/api/v1/journals/${id}`, payload);
  },

  deleteJournal: async (id) => {
    return await api.delete(`/api/v1/journals/${id}`);
  },
};
