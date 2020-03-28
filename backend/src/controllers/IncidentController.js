const connection = require('../database/connection');

module.exports = {
    async index(request, response) {
        const { page = 1 } = request.query;    //vou buscar de dentro do nosso request.query eu vou buscar o parâmetro chamado page e se ele não existir 
                                               //eu vou chamar por padrão o valor de 1

        const [count] = await connection('incidents').count();//agora estamos repassando o total de registros que nós temos no nosso banco de dados
                                                        // aqui no caso eu deixo ele retornar todos os incidents
        const incidents = await connection('incidents')
        .join('ongs', 'ong_id', '=', 'incidents.ong_id')// aqui eu quero relacionar casos de duas tabelas// aqui eu quero retornar somente os dados onde o id dentro da tabela de ongs seja = ao id do incidente// demais comentários no bloco de NOTAS
        .limit(5)//aqui eu vou limitar pra ele me retornar apenas cinco incidents
        .offset((page - 1) * 5)//aqui eu estou pegando 5 registros por página, ou seja, p. 1 vai de 0 a 5, p.2 vai de 5 até 10...
        .select([
            'incidents.*',
            'ongs.name',
            'ongs.email', 
            'ongs.whatsapp', 
            'ongs.city', 
            'ongs.uf' 
        ]);// estou listando todos os casos dos incidents// agora se você der um send no insomnia na parte list de incidents ele vai listar só 5, mas
                        // se eu for na url e colocar http://localhost:3333/incidents?page=2 e dar um send ele vai me retornar o restante dos incidents
                        // MAIS COMENTÁRIOS SOBRE ESSE SELECT NO BLOCO DE NOTAS SOBRE PÁGINAÇÃO
        response.header('X-Total-Count', count['count(*)']);// ele vai no insomnia retornar o total na parte de header, no caso  no X-Total-Count
                                                            // que é o meu total
        
        return response.json(incidents);
    },

    async create(request, response) {
        const { title, description, value } = request.body;
        const ong_id = request.headers.authorization; //eu vou requisitar o cabeçalho porque eu quero aqueles que estão autenticados porque só quem está 
                                                    //autenticado que pode cadastrar um novo incident  
                                                    // aqui vem dados da autenticação do usuário, da localização, dados sobre o idioma... 
                                                    //por isso no insomnia eu crio um header com o nome que eu coloquei aqui(authorization)
                                                    //e coloco o id da ong que eu quero pegar
        const [id] = await connection ('incidents').insert({       
            title,
            description,
            value,
            ong_id,
      });// seu eu quiser retornar o id dessa pessoa cadastrada eu crio essa const [id] (e como tem um único registro ele vai me retornar um único id)
      
      return response.json({ id });
    },

    async delete(request, response){
        const { id } = request.params;//tô pegando o id que vem lá dentro do nosso request.params que é o parâmetro de rotas
        const ong_id = request.headers.authorization;//vou pegar também o id da ong logada, assim como no meu metthod create acima, pegeuei esse id pra ver se
                                                    // realmente foi a ong que criou esse incident que está querendo deletar esse incidente

        const incident = await connection('incidents')//estou buscando o incidente de dentro da nossa tabela incidents
            .where('id', id)//aqui estou buscando um incident de id que é igual ao const id acima
            .select('ong_id')//vou selecionar disso apenas a coluna ong_id
            .first();       //como eu sei que vai me retornar apenas um registro, pois só vai haver um incident com esse id eu posso utilizar o .first que vai me retornar
                            //apenas um resultado

        if (incident.ong_id !== ong_id) { //vou fazer uma verificação se o ong_id do incident que vai ser deletado for diferente do ong_id que está 
                                        //logado na nossa aplicação
            return response.status(401).json({ error: 'Operation nor permited. ' }) //eu vou mudar o código de sucesso do status que de 200 para 401 que
                                                                                    // é o não autorizado// HTTP STATUS CODE
        }                                                                           //.json porque eu quero retornar uma resposta em formato json
    

    await connection('incidents').where('id', id).delete(); //agora se a verificação passar eu vou deletar esse incidente do app

    return response.status(204).send();// 204 é uma resposta que deu certo, mas não tem conteúdo nenhum para retonar e o send é só pra enviar a reposta vazia s/text
    }
};