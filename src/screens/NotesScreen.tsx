import React from 'react';

import { NotesTab } from '../components/mainApp/tabs/NotesTab';

export function NotesScreen(props: React.ComponentProps<typeof NotesTab>) {
  return <NotesTab {...props} />;
}

export default NotesScreen;

