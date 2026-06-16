import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 環境変数が設定されていない場合にコンソールへ警告を表示するが、ビルドが崩れないようにする
if (!supabaseUrl || supabaseUrl.includes('your-supabase-project-url')) {
  console.warn('Supabase URL is not set. Please set VITE_SUPABASE_URL in your .env file.');
}
if (!supabaseAnonKey || supabaseAnonKey.includes('your-supabase-anon-key')) {
  console.warn('Supabase Anon Key is not set. Please set VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
