require('dotenv').config();
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');

// 1. CONEXIÓN A LA BASE DE DATOS MONGODB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Base de datos de Favoritos conectada en MongoDB Atlas'))
  .catch(err => console.error('❌ Error DB:', err));

const favoritoSchema = new mongoose.Schema({
  usuarioId: String,
  productoId: String
});
favoritoSchema.index({ usuarioId: 1, productoId: 1 }, { unique: true });
const Favorito = mongoose.model('Favorito', favoritoSchema);

// 2. CONFIGURACIÓN DEL SERVIDOR gRPC (El cerebro rápido)
const PROTO_PATH = __dirname + '/favoritos.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const favoritosProto = grpc.loadPackageDefinition(packageDefinition).favoritos;

const toggleFavorito = async (call, callback) => {
  const { usuarioId, productoId } = call.request;
  try {
    const existe = await Favorito.findOne({ usuarioId, productoId });
    if (existe) {
      await Favorito.deleteOne({ _id: existe._id });
      callback(null, { exito: true, mensaje: "Corazón quitado", esFavorito: false });
    } else {
      await Favorito.create({ usuarioId, productoId });
      callback(null, { exito: true, mensaje: "Corazón agregado", esFavorito: true });
    }
  } catch (error) {
    callback(error, null);
  }
};

const getFavoritos = async (call, callback) => {
  try {
    const favs = await Favorito.find({ usuarioId: call.request.usuarioId });
    const productoIds = favs.map(f => f.productoId);
    callback(null, { productoIds });
  } catch (error) {
    callback(error, null);
  }
};

const grpcServer = new grpc.Server();
grpcServer.addService(favoritosProto.FavoritosService.service, { ToggleFavorito: toggleFavorito, GetFavoritos: getFavoritos });

// Usamos el puerto 50051 (el puerto estándar mundial para gRPC)
grpcServer.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('⚡ Motor interno gRPC corriendo en puerto 50051');
});

// 3. API GATEWAY CON EXPRESS (El puente para Angular)
const app = express();
app.use(cors());
app.use(express.json());

// Creamos un "cliente" que se conectará a nuestro propio servidor gRPC
const grpcClient = new favoritosProto.FavoritosService('localhost:50051', grpc.credentials.createInsecure());

// Ruta REST para Angular -> Se traduce a gRPC y se manda al motor interno
app.post('/api/favoritos/toggle', (req, res) => {
  grpcClient.ToggleFavorito({ usuarioId: req.body.usuarioId, productoId: req.body.productoId }, (error, response) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json(response);
  });
});

app.get('/api/favoritos/:usuarioId', (req, res) => {
  grpcClient.GetFavoritos({ usuarioId: req.params.usuarioId }, (error, response) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json(response);
  });
});

// Exportamos la app para Vercel o la encendemos si estamos en local
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 API Gateway (REST) escuchando a Angular en el puerto ${PORT}`);
  });
}
module.exports = app;