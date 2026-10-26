// Contratos auxiliares del núcleo: i18n (D12) y emisor de eventos tipado.
import { describe, expect, it, vi } from 'vitest';
import { createTranslator, interpolate, missingKeys } from '../../src/core/i18n';
import { createEmitter } from '../../src/core/events';

describe('i18n.interpolate', () => {
  it('reemplaza variables', () => {
    expect(interpolate('Faltan {n} piezas', { n: 3 })).toBe('Faltan 3 piezas');
    expect(interpolate('{a}-{b}-{a}', { a: 'x', b: 2 })).toBe('x-2-x');
  });

  it('sin vars devuelve la plantilla', () => {
    expect(interpolate('Hola {n}')).toBe('Hola {n}');
  });

  it('acepta 0 y cadena vacía como valores', () => {
    expect(interpolate('{n}|{s}', { n: 0, s: '' })).toBe('0|');
  });

  // BUG-001 (arreglado): solo propiedades propias; {constructor} no se reemplaza por el código de Object.
  it('BUG-001: no reemplaza propiedades heredadas del prototipo', () => {
    expect(interpolate('a {constructor} b', {})).toBe('a {constructor} b');
  });
});

describe('i18n.createTranslator', () => {
  it('traduce e interpola desde un diccionario dado', () => {
    const t = createTranslator({ 'x.label.a': 'Hola {who}' });
    expect(t('x.label.a', { who: 'tú' })).toBe('Hola tú');
  });

  it('clave faltante: en dev se ve marcada, avisa una sola vez y queda registrada (D12)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = createTranslator({});
    const key = 'qa.label.missing_' + Math.random().toString(36).slice(2);
    const out = t(key);
    t(key);
    expect(out === '' || out.includes(key)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(missingKeys()).toContain(key);
    warn.mockRestore();
  });
});

interface Ev {
  a: { n: number };
  v: void;
}

describe('events.createEmitter', () => {
  it('on/emit/off', () => {
    const e = createEmitter<Ev>();
    const got: number[] = [];
    const fn = (p: { n: number }) => got.push(p.n);
    e.on('a', fn);
    e.emit('a', { n: 1 });
    e.off('a', fn);
    e.emit('a', { n: 2 });
    expect(got).toEqual([1]);
  });

  it('on devuelve una función para desuscribirse', () => {
    const e = createEmitter<Ev>();
    let c = 0;
    const un = e.on('v', () => c++);
    e.emit('v');
    un();
    e.emit('v');
    expect(c).toBe(1);
  });

  it('un manejador que lanza no rompe a los demás (y se reporta con console.error)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = createEmitter<Ev>();
    let ok = false;
    e.on('v', () => {
      throw new Error('boom');
    });
    e.on('v', () => {
      ok = true;
    });
    e.emit('v');
    expect(ok).toBe(true);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('desuscribirse durante el emit no salta al siguiente manejador', () => {
    const e = createEmitter<Ev>();
    const calls: string[] = [];
    const un1 = e.on('v', () => {
      calls.push('1');
      un1();
    });
    e.on('v', () => calls.push('2'));
    e.emit('v');
    e.emit('v');
    expect(calls).toEqual(['1', '2', '2']);
  });

  it('emit sin manejadores no falla', () => {
    expect(() => createEmitter<Ev>().emit('a', { n: 1 })).not.toThrow();
  });
});
