import { connection } from 'next/server';

import HomeClient from './HomeClient';

export default async function Page() {
  await connection();
  return <HomeClient />;
}
