export const maps = {
  Keel: {
    palette:['#162937','#54758b','#7eddd7'], routes:['01','02','03','14','45','53','36','67','72','28','86'],
    rooms:[['Cafe',350,94,134,78],['Turbines',125,95,95,63],['Array',535,100,89,58],['Freight',354,255,98,84],['Dynamo',70,203,91,70],['Electrical',166,297,106,65],['Dock',490,317,89,63],['Ballast',541,218,92,64],['Beacon',642,165,82,59]]
  },
  Caldera: {
    palette:['#29263a','#836a80','#ffc488'],routes:['01','12','13','24','34','45','56','67','78','83','74'],
    rooms:[['Cafe',75,249,100,94],['Depot',180,260,88,62],['Kiln',246,349,101,56],['Electrical',285,163,101,65],['Orchard',384,252,99,62],['Survey',386,91,105,66],['Ridgeline',503,98,94,60],['Quarry',597,189,105,76],['Pump house',566,308,112,63]]
  },
  Frostline: {
    palette:['#1c2a3e','#7893ab','#a0dfef'],routes:['01','12','13','24','34','45','56','67','78','84','28'],
    rooms:[['Cafe',339,58,95,62],['Courtyard',337,145,118,56],['Electrical',148,148,115,72],['Weather mast',511,132,115,60],['Dispatch',350,245,110,67],['Ice tunnel',505,232,100,52],['Drill bay',601,312,102,68],['Archive',421,350,102,58],['Reservoir',177,307,111,76]]
  }
};

// Right-angle ship passages share these exact bends with the server floor mask.
export function corridorPoints(map,edge){
 const a=map.rooms[+edge[0]].slice(1,3),b=map.rooms[+edge[1]].slice(1,3);
 if(map!==maps.Keel)return [a,b];
 const bends={'01':[[235,94],[235,95]],'02':[[466,94],[466,100]],'03':[[350,174],[354,174]],'14':[[125,150],[70,150]],'45':[[70,260],[166,260]],'53':[[260,297],[260,255]],'36':[[425,255],[425,317]],'67':[[541,317]],'72':[[541,155],[535,155]],'28':[[642,100]],'86':[[642,317]]};
 return [a,...bends[edge],b];
}
