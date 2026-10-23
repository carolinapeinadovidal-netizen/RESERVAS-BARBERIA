// Fotos libres de Pixabay (https://pixabay.com/service/license-summary/)
// Se asocian por id de la base de datos.

const PIXABAY = (ruta) => `https://cdn.pixabay.com/photo/${ruta}_640.jpg`;

const IMAGENES = {
  barberos: {
    1: PIXABAY('2021/11/23/13/40/barber-6818702'),   // Sendi
    2: PIXABAY('2020/07/22/04/27/barber-5428008'),   // Carlos
    3: PIXABAY('2020/05/14/12/37/barber-5194406'),   // Javier
  },
  servicios: {
    1: PIXABAY('2018/07/30/09/08/hairdresser-3572052'),   // Corte de pelo
    2: PIXABAY('2016/04/06/13/36/hairdresser-1311791'),   // Corte de pelo y barba
    3: PIXABAY('2018/02/22/17/08/barber-3173419'),        // Arreglo de barba
    4: PIXABAY('2016/12/17/19/08/barber-1914148'),        // Afeitado clásico con navaja
    5: PIXABAY('2021/11/23/13/47/barber-6818719'),        // Corte infantil
    6: PIXABAY('2015/10/26/20/46/haircut-1007891'),       // Degradado (fade)
    7: PIXABAY('2017/03/16/08/21/razor-2148442'),         // Rapado a máquina
    8: PIXABAY('2019/06/04/20/00/man-4252192'),           // Tinte de pelo
    9: PIXABAY('2016/02/04/17/15/hairdresser-1179461'),   // Lavado y peinado
    10: PIXABAY('2018/11/28/02/08/man-3842818'),          // Perfilado de cejas
  },
  // Para barberos o servicios nuevos que aún no tengan foto
  barberoPorDefecto: PIXABAY('2021/11/23/13/43/barber-6818710'),
  servicioPorDefecto: PIXABAY('2015/10/26/20/32/barber-1007874'),
};
