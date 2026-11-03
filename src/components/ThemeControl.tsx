import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ThemeControl() {
  const [theme, setTheme] = useState('light');
  useEffect(() => { setTheme(localStorage.getItem('fa.theme') || 'light'); }, []);
  return <Select value={theme} onValueChange={value => {
    setTheme(value); localStorage.setItem('fa.theme', value);
    document.documentElement.classList.remove('dark', 'high-contrast');
    if (value !== 'light') document.documentElement.classList.add(value);
  }}><SelectTrigger aria-label="Theme" className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="high-contrast">High contrast</SelectItem></SelectContent></Select>;
}