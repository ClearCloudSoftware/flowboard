import { Loader } from '@/components/loader';

/** Shown while a page's route loads. */
export default function Loading() {
  return (
    <div className="grid flex-1 place-items-center p-12">
      <Loader size={64} className="flex-col font-mono text-[13px]" />
    </div>
  );
}
