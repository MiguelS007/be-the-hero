const connection = require  ('../database/connection');

module.exports = { //vai retornar os casos específicos de uma única ong
    async index(request, response) {
        const ong_id = request.headers.authorization;    //vou começar acessando os dados da ong que está logada

        const incidents = await connection('incidents')//e aqui eu vou buscar todos os incidents que foi a ong que está logada que
            .where('ong_id', ong_id)                   // criou
            .select('*');                    //vou pegar todos os campos desses incidents

        return response.json(incidents)
    }
}