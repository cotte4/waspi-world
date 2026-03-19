'use client';

import dynamic from 'next/dynamic';

const GamePage = dynamic(() => import('./GamePage'), { ssr: false });

export default function Page() {
  return <GamePage />;
}
