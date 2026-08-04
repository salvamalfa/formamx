Botón pill de forma. La jerarquía es de color, no de tamaño: naranja para la acción principal, azul para las secundarias.

```jsx
<Button variant="primary" onClick={...}>Ver la bitácora</Button>
<Button variant="secondary" size="sm">Escríbeme</Button>
<Button variant="tertiary">Ver materiales</Button>
```

Variantes: `primary` naranja pleno (una sola por vista) · `secondary` azul pleno · `tertiary` contorno azul, relleno blanco, letra azul · `support` verde bosque para lo que vive afuera · `ghost` solo texto azul. Tamaños sm/md/lg. Sobre fondo de color pleno, invierte: relleno blanco con letra azul. Sin iconos por defecto; si llevan, Lucide 2px a la izquierda.
