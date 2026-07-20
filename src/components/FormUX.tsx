'use client';

import { useEffect } from 'react';

/**
 * Mejoras de usabilidad globales para todos los formularios:
 * - Al enviar, el botón se deshabilita y muestra "Procesando…" (evita dobles envíos).
 * - Los botones con data-confirm piden confirmación antes de enviar.
 * Se monta una sola vez en el layout raíz.
 */
export function FormUX() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button[data-confirm]');
      if (btn && !window.confirm(btn.getAttribute('data-confirm') || '¿Confirma la acción?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      const btn = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
      if (!btn) return;
      // Deshabilitar después de que el navegador capture los datos del formulario
      setTimeout(() => {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent ?? '';
        btn.textContent = 'Procesando…';
        // Red de seguridad: rehabilitar si la navegación no ocurrió (p. ej. error de red)
        setTimeout(() => {
          btn.disabled = false;
          if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
        }, 15000);
      }, 0);
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit);
    };
  }, []);

  return null;
}
