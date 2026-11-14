import { TrainingTabs } from "@/features/training/components/training-tabs";

export default function TrainingLayout({ children }: LayoutProps<"/training">) {
  return (
    <>
      <TrainingTabs />
      {children}
    </>
  );
}
