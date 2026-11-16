import { Loader } from '@/components/loader';

/** Shown while a page's route loads. */
export default function Loading() {
  return <Loader size={64} className="min-h-svh" />;
}
