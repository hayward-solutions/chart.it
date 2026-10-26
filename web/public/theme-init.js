try {
  var t = localStorage.getItem('chartit.theme')
  var dark =
    t === 'dark' ||
    ((t === null || t === 'system') && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
} catch (e) {}
