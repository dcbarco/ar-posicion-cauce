// Registro de experiencias para HOME. Hasta que exista la lógica real (F2), cada tarjeta
// abre la MockExperience con su id, para probar el flujo completo.
import type { ExperienceId, ExperienceMeta } from '../core/contracts';

export const EXPERIENCE_ORDER: readonly ExperienceId[] = ['taller', 'cuenca', 'cosmos'];

const mock = (id: ExperienceId) => () => import('./mock/logic/mock-experience').then((m) => m.createMockExperience(id));

export const EXPERIENCES: Record<ExperienceId, ExperienceMeta> = {
  taller: { id: 'taller', image: '', preload: ['motor4t'], factory: () => import('./taller/logic/taller').then((m) => m.createTaller()) },
  cuenca: { id: 'cuenca', image: '', preload: [], factory: mock('cuenca') },
  cosmos: { id: 'cosmos', image: '', preload: [], factory: mock('cosmos') },
};
