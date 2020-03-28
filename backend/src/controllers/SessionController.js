const connection = require('../database/connection');

module.exports = {
    async create(request, response) {
        const { id } = request.body;        //só estou verificando se a ong realmente existe para validar o login dela

        const ong = await connection('ongs')//estou buscando uma ong do banco de dados
            .where('id', id)
            .select('name')
            .first();//assim ele não me retorna um array e sim apenas um resultado

        if (!ong) { //se essa ong não existir
            return response.status(400).json({ error: 'No ONG found with this ID' });
        }

        return response.json(ong);//se tudo deu certo eu vou retornar os dados da minha ong, apenas o nome dela
    }
}