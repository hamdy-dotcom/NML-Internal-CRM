import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import MerchantDetailClient from './MerchantDetailClient';
import type { Merchant, Activity, Task, FormLink, FormTemplate, FormSubmission, MerchantOnboarding, MerchantOnboardingStep, AuditLog, Attachment, Profile } from '@/lib/database.types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MerchantDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: merchant, error },
    { data: activities },
    { data: tasks },
    { data: formLinks },
    { data: formTemplates },
    { data: formSubmissions },
    { data: onboarding },
    { data: onboardingSteps },
    { count: productCount },
    { data: auditLogs },
    { data: attachments },
    { data: currentProfile },
  ] = await Promise.all([
    supabase.from('merchants').select('*').eq('id', id).single(),
    supabase.from('activities').select('*').eq('merchant_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('tasks').select('*').eq('merchant_id', id).order('created_at', { ascending: false }),
    supabase.from('form_links').select('*').eq('merchant_id', id).order('sent_at', { ascending: false }),
    supabase.from('form_templates').select('*').eq('is_active', true),
    supabase.from('form_submissions').select('*').eq('merchant_id', id),
    supabase.from('merchant_onboarding').select('*').eq('merchant_id', id).maybeSingle(),
    supabase.from('merchant_onboarding_steps').select('*').eq('merchant_id', id).order('order_index'),
    supabase.from('products').select('*', { count: 'exact', head: true } as any).eq('merchant_id', id),
    supabase.from('audit_log').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('attachments').select('*').eq('merchant_id', id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('id', user?.id ?? '').maybeSingle(),
  ]);

  if (error || !merchant) notFound();

  return (
    <MerchantDetailClient
      merchant={merchant as Merchant}
      activities={(activities ?? []) as Activity[]}
      tasks={(tasks ?? []) as Task[]}
      formLinks={(formLinks ?? []) as FormLink[]}
      formTemplates={(formTemplates ?? []) as FormTemplate[]}
      formSubmissions={(formSubmissions ?? []) as FormSubmission[]}
      onboarding={(onboarding ?? null) as MerchantOnboarding | null}
      onboardingSteps={(onboardingSteps ?? []) as MerchantOnboardingStep[]}
      productCount={productCount ?? 0}
      auditLogs={(auditLogs ?? []) as AuditLog[]}
      attachments={(attachments ?? []) as Attachment[]}
      currentUserId={user?.id ?? null}
      currentProfile={(currentProfile ?? null) as Profile | null}
    />
  );
}
